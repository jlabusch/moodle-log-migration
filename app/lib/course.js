var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    bogus_email = require('./common.js').bogus_email,
    fix_by_shadow_index = require('./common.js').fix_by_shadow_index,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    'add mod': undefined,
    'completion updated': {
        /*
        | userid | course | cmid | url                   | info |
        +--------+--------+------+-----------------------+------+
        |      2 |     97 |    0 | completion.php?id=97  |      |
        */
        alias: () => { make_alias(library, 'completion updated', 'enrol') },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url.replace(/id=\d+/, 'id=' + match_row.course);
            var output ='INSERT INTO mdl_log ' +
                        '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                        '(' +
                            [
                                old_row.time,
                                match_row.userid,
                                "'" + old_row.ip + "'",
                                match_row.course,
                                "'" + old_row.module + "'",
                                old_row.cmid,
                                "'" + old_row.action + "'",
                                "'" + updated_url + "'",
                                "'" + old_row.info + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    'delete': undefined,
    'delete row': undefined,
    'editsection':
        /*
        | userid | course | cmid | url                    | info |
        +--------+--------+------+------------------------+------+
        |      2 |     18 |    0 | editsection.php?id=104 |      |
        |      2 |     18 |    0 | editsection.php?id=105 | 1    |

        TODO
        */
        undefined,
    'enrol': {
        /*
        | userid | course | cmid | url                      | info |
        +--------+--------+------+--------------------------+------+
        |   1566 |     20 |    0 | view.php?id=20           | 20   |
        |   3086 |     20 |    0 | ../enrol/users.php?id=20 | 20   |
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.email, u.username, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u on u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'course' AND log.action = 'enrol' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.email, u.username ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON BINARY u.email = ? ' +
                'WHERE c.shortname = ?',
                [
                    row["email"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.username;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url.replace(/id=\d+/, 'id=' + match_row.course);
            var output ='INSERT INTO mdl_log ' +
                        '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                        '(' +
                            [
                                old_row.time,
                                match_row.userid,
                                "'" + old_row.ip + "'",
                                match_row.course,
                                "'" + old_row.module + "'",
                                old_row.cmid,
                                "'" + old_row.action + "'",
                                "'" + updated_url + "'",
                                "'" + match_row.course + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    'guest': 
        /*
        "guest" has only a single row (below). Not worth writing code for.

        | id    | time       | userid | ip            | course | module | cmid |...
        +-------+------------+--------+---------------+--------+--------+------+...
        | 28757 | 1255679386 |      1 | 212.163.190.6 |     20 | course |    0 |...

                                                    ...| action | url            | info          |
                                                    ...+--------+----------------+---------------+
                                                    ...| guest  | view.php?id=20 | 212.163.190.6 |
        */
        undefined,
    'new': undefined,
    'recent': {
        /*
        | userid | course | cmid | url               | info |
        +--------+--------+------+-------------------+------+
        |     21 |     18 |    0 | recent.php?id=18  |      |
        |   3132 |    274 |    0 | recent.php?id=274 | 274  |
        */
        alias: () => { make_alias(library, 'recent', 'enrol') },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url.replace(/id=\d+/, 'id=' + match_row.course);
            var output ='INSERT INTO mdl_log ' +
                        '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                        '(' +
                            [
                                old_row.time,
                                match_row.userid,
                                "'" + old_row.ip + "'",
                                match_row.course,
                                "'" + old_row.module + "'",
                                old_row.cmid,
                                "'" + old_row.action + "'",
                                "'" + updated_url + "'",
                                "'" + (old_row.info ? match_row.course : '') + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    'report live': undefined,
    'report log': undefined,
    'report outline': undefined,
    'report participation': undefined,
    'report stats': undefined,
    'unenrol': undefined,
    'update': undefined,
    'update mod': undefined,
    'user report': undefined,
    'view': undefined,
    'view section': undefined
};

module.exports = library;
