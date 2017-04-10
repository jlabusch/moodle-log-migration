var mysql = require('mysql'),
    audit = require('./audit.js');

var pools = {
    old: {
        handle: undefined,
        spec: {
            host: "db",
            user: "root",
            password: "",
            database: "moodle_old",
            //debug: ['ComQueryPacket', 'RowDataPacket'],
            connectionLimit: 20
        }
    },
    new: {
        handle: undefined,
        spec: {
            host: "db",
            user: "root",
            password: "",
            database: "moodle_new",
            //debug: ['ComQueryPacket', 'RowDataPacket'],
            connectionLimit: 20
        }
    }
};

var mk = function(){ return Array.prototype.slice.call(arguments, 0).join('.') },
    stats = {
    };

function inc_stat(key){
    if (!stats[key]){
        stats[key] = 0;
    }
    ++stats[key];
}

exports.run = function(){
    get_good_connection(pools.old.spec, () => {
        pools.old.handle = mysql.createPool(pools.old.spec);
        get_good_connection(pools.new.spec, () =>{
            pools.new.handle = mysql.createPool(pools.new.spec);
            start_migration();
        });
    });
}

function get_good_connection(spec, then){
    var conn = mysql.createConnection(spec);
    conn.connect();
    conn.query(
        'select 1 + 1 as solution',
        function(err, res, fields){
            if (err){
                console.log(JSON.stringify(err));
                setTimeout(function(){ get_good_connection(spec, then); }, 10000);
                return;
            }
            conn.end();
            then();
        }
    );
}

function start_migration(){
    pools.old.handle.query(
        'select distinct module from mdl_log',
        function(err, res){
            if (err){
                throw err;
            }
            res.forEach(r => process_module('mdl_log', r.module));
        }
    );
}

function is_allowed(env, val){
    if (!env){
        return true;
    }
    var ok = false;
    env.split(',').forEach((x) => { if (x === val){ ok = true } });
    return ok;
}

function process_module(t, m){
    var key = mk(t, m);
    if (is_allowed(process.env.RESTRICT_MODULES, m) === false){
        console.log(key + ' not listed in RESTRICT_MODULES, skipping...');
        return;
    }
    if (migration_functions[t] === undefined ||
        migration_functions[t][m] === undefined)
    {
        console.log('No supporting functions for ' + key);
        return;
    }
    console.log('starting ' + key);
    pools.old.handle.query(
        'select distinct action from ' + t + ' where module = ?',
        [m],
        function(err, res){
            if (err){
                console.log('ERROR for ' + key);
                throw err;
            }
            process_action(t, m, res.shift(), res);
        }
    );
}

function process_action(t, m, a, alist){
    if (a === undefined){
        console.log('completed ' + mk(t,m));
        Object.keys(stats).sort().forEach((s) => {
            console.log('\t' + s + ': ' + stats[s]);
        });
        return;
    }
    console.log('process_action(' + t + ', ' + m + ', ' + JSON.stringify(a) + ')');
    a = a.action;
    var key = mk(t,m,a),
        next = () => { process_action(t, m, alist.shift(), alist) };
    if (is_allowed(process.env.RESTRICT_ACTIONS, a) === false){
        console.log(key + ' not listed in RESTRICT_ACTIONS, skipping...');
        return next();
    }
    if (migration_functions[t][m][a] === undefined){
        console.log('No supporting functions for ' + key);
        return next();
    }
    console.log('starting ' + key);
    var tool = migration_functions[t][m][a];
    if (tool.alias){
        tool.alias();
    }
    console.log('query ' + key + '\t' + tool.sql_old.replace(/\s+/g, ' '));
    pools.old.handle.query(
        tool.sql_old,
        function(err, res){
            if (err){
                console.log('ERROR for ' + key);
                throw err;
            }
            migrate_log_rows(t, m, a, res.shift(), res, next);
        }
    );
}

var migration_functions = {
    mdl_log: {
        calendar: "Can't be migrated because mdl_event_subscriptions is empty",
        forum:  require('./forums.js'),
        login:  require('./login.js'),
        course: require('./course.js'),
        user:   require('./user.js'),
        upload: undefined,
        admin: undefined,
        blog: undefined,
        library: undefined,
        message: undefined,
        notes: undefined,
        page: undefined,
        resource: undefined,
        role: undefined,
        tag: undefined,
        assign: undefined,
        assignment: undefined,
        chat: undefined,
        feedback: undefined,
        glossary: undefined,
        scorm:  require('./scorm.js'),
        wiki: undefined,
        workshop: undefined,
        discussion: undefined,
        book: undefined,
        folder: undefined,
        imscp: undefined,
        label: undefined,
        url: undefined,
        quiz: require('./quiz.js'),
        choice: undefined,
        lesson: undefined,
        lti: undefined,
        data: undefined,
        journal: undefined,
        bigbluebuttonbn: undefined
    }
};

function migrate_log_rows(t, m, a, row, rest, done){
    var key = mk(t,m,a);
    if (row === undefined){
        done && done();
        console.log('completed ' + key);
        audit(t, m, a).flush();
        return;
    }
    inc_stat(key + '.count');
    var tool = migration_functions[t][m][a],
        next = () => { migrate_log_rows(t, m, a, rest.shift(), rest, done) },
        verbose = tool.verbose;
        run_match = (r) => {
            pools.old.handle.query(
                tool.sql_match(r),
                function(err, shadow_match){
                    if (err){
                        console.log('ERROR for ' + key + '(shadow query)');
                        throw err;
                    }
                    pools.new.handle.query(
                        tool.sql_match(r, shadow_match),
                        function(err, new_match){
                            if (err){
                                console.log('ERROR for ' + key + '(primary query)');
                                throw err;
                            }
                            if (!new_match || new_match.length < 1){
                                inc_stat(key + '.no_matches');
                                console.log('ERROR for ' + key + ': no matches found for ' + JSON.stringify(r));
                                console.log('ERROR shadow SQL: ' + tool.sql_match(r).replace(/\s+/g, ' '));
                                console.log('ERROR match  SQL: ' + tool.sql_match(r, shadow_match).replace(/\s+/g, ' '));
                                return next();
                            }
                            if (new_match.length > 1){
                                verbose = true;
                                inc_stat(key + '.multiple_matches');
                                if (tool.fixer){
                                    var fix = tool.fixer(r, shadow_match, new_match);
                                    if (fix){
                                        new_match[0] = fix;
                                        inc_stat(key + '.multiple_matches_fixed');
                                        verbose = false;
                                    }
                                }else{
                                    inc_stat(key + '.multiple_matches_ignored');
                                }
                                if (verbose){
                                    console.log('WARNING for ' + key + ': multiple rows returned');
                                    new_match.forEach((r) => { console.log('DUP\t' + JSON.stringify(r)) });
                                    shadow_match.forEach((r) => { console.log('SHADOW\t' + JSON.stringify(r)) });
                                    console.log('CHOSE\t' + JSON.stringify(new_match[0]));
                                }
                            }
                            if (verbose){
                                console.log(JSON.stringify(r));
                                console.log('=>');
                                console.log(JSON.stringify(new_match[0]));
                            }
                            tool.fn(r, new_match[0], function(err, update){
                                if (err){
                                    console.log(key + ' => ' + JSON.stringify(new_match));
                                    console.log(JSON.stringify(err));
                                    // carry on anyway
                                }else{
                                    //console.log('OUT=\t' + update);
                                }
                                audit(t, m, a).append(r, new_match[0], update);
                                return next();
                            });
                        }
                    );
                }
            );
        };
    if (tool.sql_old_2pass){
        var sql = undefined; // getting SQL can fail if there's not enough data,
                             // e.g. for scorm/view rows without a scoid in the URL.
        try{
            sql = tool.sql_old_2pass(row);
        }catch(ex){
            console.log('ERROR for ' + key + ' (2pass) - ' + ex.message);
        }
        if (!sql){
            run_match(row);
        }else{
            pools.old.handle.query(
                sql,
                function(err, p2res){
                    if (err){
                        console.log('ERROR for ' + key + '(2pass)');
                        throw err;
                    }
                    if (p2res.length < 1){
                        inc_stat(key + '.no_matches_p2');
                        console.log('ERROR for ' + key + ' (2pass - no results) - ' + sql.replace(/\s+/g, ' '));
                        return next();
                    }
                    Object.keys(p2res[0]).forEach((x) => {
                        row[x] = p2res[0][x];
                    });
                    run_match(row);
                }
            );
        }
    }else{
        run_match(row);
    }
}

