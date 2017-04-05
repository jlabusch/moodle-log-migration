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
                console.error(JSON.stringify(err));
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
        console.error(key + ' not listed in RESTRICT_MODULES, skipping...');
        return;
    }
    if (migration_functions[t] === undefined ||
        migration_functions[t][m] === undefined)
    {
        console.error('No supporting functions for ' + key);
        return;
    }
    console.log('starting ' + key);
    pools.old.handle.query(
        'select distinct action from ' + t + ' where module = ?',
        [m],
        function(err, res){
            if (err){
                console.error('ERROR for ' + key);
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
        console.error(key + ' not listed in RESTRICT_ACTIONS, skipping...');
        return next();
    }
    if (migration_functions[t][m][a] === undefined){
        console.error('No supporting functions for ' + key);
        return next();
    }
    console.log('starting ' + key);
    var tool = migration_functions[t][m][a];
    if (tool.alias){
        tool.alias();
    }
    console.log('query ' + key + '\t' + tool.sql_old);
    pools.old.handle.query(
        tool.sql_old,
        function(err, res){
            if (err){
                console.error('ERROR for ' + key);
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
        user:   require('./user.js')
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
    var tool = migration_functions[t][m][a];
    pools.old.handle.query(
        tool.sql_match(row),
        function(err, shadow_match){
            if (err){
                console.error('ERROR for ' + key + '(shadow query)');
                throw err;
            }
            pools.new.handle.query(
                tool.sql_match(row, shadow_match),
                function(err, new_match){
                    if (err){
                        console.error('ERROR for ' + key + '(primary query)');
                        throw err;
                    }
                    var next = () => { migrate_log_rows(t, m, a, rest.shift(), rest, done) },
                        verbose = tool.verbose;
                    if (!new_match || new_match.length < 1){
                        inc_stat(key + '.no_matches');
                        console.log('ERROR for ' + key + ': no matches found for ' + JSON.stringify(row));
                        console.log('ERROR shadow SQL: ' + tool.sql_match(row));
                        console.log('ERROR match  SQL: ' + tool.sql_match(row, shadow_match));
                        return next();
                    }
                    if (new_match.length > 1){
                        verbose = true;
                        inc_stat(key + '.multiple_matches');
                        if (tool.fixer){
                            var fix = tool.fixer(row, shadow_match, new_match);
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
                        console.log(JSON.stringify(row));
                        console.log('=>');
                        console.log(JSON.stringify(new_match[0]));
                    }
                    tool.fn(row, new_match[0], function(err, update){
                        if (err){
                            console.error(key + ' => ' + JSON.stringify(new_match));
                            console.error(JSON.stringify(err));
                            // carry on anyway
                        }else{
                            //console.log('OUT=\t' + update);
                        }
                        audit(t, m, a).append(row, new_match[0], update);
                        return next();
                    });
                }
            );
        }
    );
}

