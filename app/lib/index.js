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
    [
        {t: 'mdl_log', col: 'module'},
        {t: 'mdl_logstore_standard_log', col: 'objecttable'}
    ].forEach((spec) => {
        if (is_allowed(process.env.RESTRICT_TABLES, spec.t)){
            dbs.old.query(
                migration_functions[spec.t].__module_sql,
                function(err, res){
                    if (err){
                        throw err;
                    }
                    res.forEach((r,i) => {
                        setTimeout(
                            function(){
                                process_module(spec.t, r[spec.col]);
                            },
                            i*1000
                        );
                    });
                }
            );
        }
    });
}

function is_allowed(env, val){
    if (!env){
        return true;
    }
    let ok = false;
    env.split(',').forEach((x) => { if (x === val){ ok = true } });
    return ok;
}

function number_of_modules_in_progress(){
    return Object.keys(stats).reduce((acc, val) => { return acc + (val.indexOf('in progress') > -1)|0 }, 0);
}

function process_module(t, m){
    let key = mk(t, m);
    if (process.env.CONCURRENT_MODULES_MAX &&
        number_of_modules_in_progress() > parseInt(process.env.CONCURRENT_MODULES_MAX))
    {
        console.log(`${key} waiting for other modules to complete...`);
        setTimeout(
            function(){
                process_module(t, m);
            },
            5*1000
        );
        return;
    }
    if (is_allowed(process.env.RESTRICT_MODULES, key) === false){
        console.log(key + ' not listed in RESTRICT_MODULES, skipping...');
        return;
    }
    if (migration_functions[t] === undefined ||
        migration_functions[t].__lookup(m) === undefined)
    {
        console.log('No supporting functions for ' + key);
        return;
    }
    stats[key + ' (in progress...)'] = true;
    console.log('starting ' + key);
    dbs.old.query(
        migration_functions[t].__action_sql,
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
    if (is_allowed(process.env.RESTRICT_ACTIONS, key) === false){
        console.log(key + ' not listed in RESTRICT_ACTIONS, skipping...');
        return next();
    }
    let tool = migration_functions[t].__lookup(m, a);
    if (!tool){
        console.log('No supporting functions for ' + key);
        return next();
    }
    stats[key + '.time'] = new Date();
    console.log('starting ' + key);
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
    mdl_logstore_standard_log: {
        __module_sql: 'select distinct objecttable from mdl_logstore_standard_log',
        __action_sql: 'select distinct action from mdl_logstore_standard_log where objecttable = ?',
        __lookup: require('./logstore_standard')
    },
    mdl_log: {
        __module_sql: 'select distinct module from mdl_log',
        __action_sql: 'select distinct action from mdl_log where module = ?',
        __lookup: (m, a) => {
            if (a){
                let x = migration_functions.mdl_log[m][a];
                if (x && x.alias){
                    x.alias();
                }
                return x;
            }
            return migration_functions.mdl_log[m];
        },
        calendar:  undefined, //"Can't be migrated because mdl_event_subscriptions is empty",
        forum:  require('./forums.js'),
        login:  require('./login.js'),
        course: require('./course.js'),
        user:   require('./user.js'),
        upload: require('./upload.js'),
        admin: require('./admin.js'),
        blog: require('./blog.js'),
        library: require('./library.js'),
        message: require('./message.js'),
        notes: require('./notes.js'),
        page: require('./page.js'),
        resource:  require('./resource.js'),
        role: require('./role.js'),
        tag: require('./tag.js'),
        assign:     require('./assign.js'),
        assignment: require('./assignment.js'),
        chat: require('./chat.js'),
        feedback: require('./feedback.js'),
        glossary: require('./glossary.js'),
        scorm:  require('./scorm.js'),
        wiki: require('./wiki.js'),
        workshop: require('./workshop.js'),
        discussion: require('./discussion.js'),
        book: require('./book.js'),
        folder: require('./folder.js'),
        imscp: require('./imscp.js'),
        label:  require('./label.js'),
        url: require('./url.js'),
        quiz: require('./quiz.js'),
        choice: require('./choice.js'),
        lesson: require('./lesson.js'),
        lti: require('./lti.js'),
        data: require('./data.js'),
        journal:  undefined, //"Can't be migrated because mdl_journal table is missing",
        bigbluebuttonbn:  undefined, //"Can't be migrated because mdl_bigbluebuttonbn table is missing"
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
    let tool = migration_functions[t].__lookup(m, a),
        next = () => { migrate_log_rows(t, m, a, rest.shift(), rest, done) },
        verbose = tool.verbose,
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
        let sql = tool.sql_old_2pass(row);
        if (!sql){
            inc_stat(key + '.aborted_p2');
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

