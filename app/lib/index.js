/*eslint no-console: ["warn", { allow: ["log"] }] */

var audit = require('./audit.js'),
    dbs = require('./dbs.js');

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
    dbs.old.test_connection(() => {
        dbs.new.test_connection(
            start_migration
        );
    });
}

function start_migration(){
    dbs.old.query(
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
    let ok = false;
    env.split(',').forEach((x) => { if (x === val){ ok = true } });
    return ok;
}

function process_module(t, m){
    let key = mk(t, m);
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
    stats[key + ' (in progress...)'] = true;
    console.log('starting ' + key);
    dbs.old.query(
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
        delete stats[mk(t, m) + ' (in progress...)'];
        Object.keys(stats).sort().forEach((s) => {
            console.log('\t' + s + ': ' + stats[s]);
        });
        return;
    }
    console.log('process_action(' + t + ', ' + m + ', ' + JSON.stringify(a) + ')');
    a = a.action;
    let key = mk(t,m,a),
        next = () => { process_action(t, m, alist.shift(), alist) };
    if (is_allowed(process.env.RESTRICT_ACTIONS, a) === false){
        console.log(key + ' not listed in RESTRICT_ACTIONS, skipping...');
        return next();
    }
    if (migration_functions[t][m][a] === undefined){
        console.log('No supporting functions for ' + key);
        return next();
    }
    stats[key + '.time'] = new Date();
    console.log('starting ' + key);
    let tool = migration_functions[t][m][a];
    if (tool.alias){
        tool.alias();
    }
    console.log('query ' + key + '\t' + tool.sql_old.replace(/\s+/g, ' '));
    dbs.old.query(
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
        admin: require('./admin.js'),
        blog: undefined,
        library: undefined,
        message: require('./message.js'),
        notes: undefined,
        page: undefined,
        resource: undefined,
        role: undefined,
        tag: undefined,
        assign:     require('./assign.js'),
        assignment: require('./assignment.js'),
        chat: undefined,
        feedback: require('./feedback.js'),
        glossary: require('./glossary.js'),
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
    let key = mk(t,m,a);
    if (row === undefined){
        var time = stats[key + '.time'];
        stats[key + '.time'] = ((new Date()) - time) + 'ms';
        console.log('completed ' + key);
        audit(t, m, a).flush();
        done && done();
        return;
    }
    inc_stat(key + '.count');
    let tool = migration_functions[t][m][a],
        next = () => { migrate_log_rows(t, m, a, rest.shift(), rest, done) },
        verbose = tool.verbose;
        run_match = (r) => {
            let sm = tool.sql_match(r);
            if (!sm){
                console.log('ERROR for ' + key + ': insufficient data for query - ' + JSON.stringify(r));
                return next();
            }
            dbs.old.query(
                sm,
                function(err, shadow_match){
                    if (err){
                        console.log('ERROR for ' + key + '(shadow query)');
                        throw err;
                    }
                    dbs.new.query(
                        sm,
                        function(err, new_match){
                            if (err){
                                console.log('ERROR for ' + key + '(primary query)');
                                throw err;
                            }
                            // MySQL and Postgres quirks. Get to one format: rows in an array.
                            if (new_match){
                                if (new_match.rows){
                                    new_match = new_match.rows;
                                }else if(Array.isArray(new_match) === false){
                                    new_match = [new_match];
                                }
                            }
                            if (!new_match || new_match.length < 1){
                                if (tool.match_failed_because_of_known_bad_data &&
                                    tool.match_failed_because_of_known_bad_data(r))
                                {
                                    inc_stat(key + '.no_matches_known_bad_data');
                                }else{
                                    inc_stat(key + '.no_matches');
                                    if (tool.format && tool.format['no_matches']){
                                        console.log('ERROR for ' + key + ': ' + tool.format['no_matches'](r));
                                    }else{
                                        console.log('ERROR for ' + key + ': no matches found for ' + JSON.stringify(r));
                                        console.log('ERROR match SQL: ' + dbs.mysql_to_postgres(sm.replace(/\s+/g, ' ')));
                                    }
                                }
                                return next();
                            }
                            let chosen = undefined;
                            if (new_match.length === 1){
                                chosen = new_match[0];
                            }else if (new_match.length > 1){
                                inc_stat(key + '.multiple_matches');
                                if (tool.fixer){
                                    chosen = tool.fixer(r, shadow_match, new_match);
                                    if (chosen){
                                        inc_stat(key + '.multiple_matches_fixed');
                                    }else{
                                        if (tool.match_failed_because_of_known_bad_data &&
                                            tool.match_failed_because_of_known_bad_data(r))
                                        {
                                            inc_stat(key + '.no_matches_known_bad_data');
                                        }else{
                                            inc_stat(key + '.multiple_matches_unresolved (no solution)');
                                            if (tool.format && tool.format['multiple_matches_unresolved']){
                                                console.log('ERROR for ' + key + ': ' + tool.format['multiple_matches_unresolved'](r));
                                            }else{
                                                console.log('ERROR for ' + key + ': multiple rows unresolved');
                                                console.log('ROW\t' + JSON.stringify(r));
                                                new_match.forEach((r) => { console.log('DUP\t' + JSON.stringify(r)) });
                                                shadow_match.forEach((r) => { console.log('SHADOW\t' + JSON.stringify(r)) });
                                                console.log('NO SOLUTION');
                                            }
                                        }
                                        return next();
                                    }
                                }else{
                                    chosen = new_match[0];
                                    inc_stat(key + '.multiple_matches_ignored (chose match[0])');
                                    if (tool.format && tool.format['multiple_matches']){
                                        console.log('WARNING for ' + key + ': ' + tool.format['multiple_matches'](r));
                                    }else{
                                        console.log('WARNING for ' + key + ': multiple rows returned');
                                        console.log('ROW\t' + JSON.stringify(r));
                                        new_match.forEach((r) => { console.log('DUP\t' + JSON.stringify(r)) });
                                        shadow_match.forEach((r) => { console.log('SHADOW\t' + JSON.stringify(r)) });
                                        console.log('CHOSE\t' + JSON.stringify(new_match[0]));
                                    }
                                }
                            }
                            if (verbose){
                                console.log(JSON.stringify(r));
                                console.log('=>');
                                console.log(JSON.stringify(chosen));
                            }
                            tool.fn(r, chosen, function(err, update){
                                if (err){
                                    console.log(key + ' => ' + JSON.stringify(chosen));
                                    console.log(JSON.stringify(err));
                                }else{
                                    audit(t, m, a).append(r, chosen, update);
                                }
                                return next();
                            });
                        }
                    );
                }
            );
        };
    if (tool.sql_old_2pass){
        let sql = undefined; // getting SQL can fail if there's not enough data,
                             // e.g. for scorm/view rows without a scoid in the URL.
        try{
            sql = tool.sql_old_2pass(row);
        }catch(ex){
            console.log('ERROR for ' + key + ' (2pass) - ' + ex.message);
        }
        if (!sql){
            run_match(row);
        }else{
            dbs.old.query(
                sql,
                function(err, p2res){
                    if (err){
                        console.log('ERROR for ' + key + '(2pass)');
                        throw err;
                    }
                    if (p2res.length < 1){
                        inc_stat(key + '.no_matches_p2');
                        if (tool.format && tool.format['no_matches_p2']){
                            console.log('ERROR for ' + key + ': ' + tool.format['no_matches_p2'](row));
                        }else{
                            console.log('ERROR for ' + key + ' (2pass - no results) - ' + sql.replace(/\s+/g, ' '));
                        }
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

