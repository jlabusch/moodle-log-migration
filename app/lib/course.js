var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    'add mod': {
        /*
        mysql> SELECT * FROM mdl_log WHERE module='course' AND action = 'add mod' ORDER BY id DESC LIMIT 1;
        +---------+------------+--------+-----------+--------+--------+------+---------+-------------------------------+-----------+
        | id      | time       | userid | ip        | course | module | cmid | action  | url                           | info      |
        +---------+------------+--------+-----------+--------+--------+------+---------+-------------------------------+-----------+
        | 2156894 | 1430146494 |      2 | 10.0.0.41 |    211 | course |    0 | add mod | ../mod/page/view.php?id=26554 | page 3592 |
        +---------+------------+--------+-----------+--------+--------+------+---------+-------------------------------+-----------+

        userid     => mdl_user.id
        course     => mdl_course.id
        // module  => mdl_module.name
        // cmid    => mdl_course_modules.id
        url: id    => mdl_course_modules.id
        info: page => mdl_module.name, number = mdl_course_modules.instance / mdl_page.id

        mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'add mod';
        +----------+
        | count(*) |
        +----------+
        |     2772 |
        +----------+
        */
    },

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
        /*
        mysql> SELECT * FROM mdl_log WHERE module='course' AND action = 'delete' ORDER BY id DESC LIMIT 1;
        +---------+------------+--------+-----------------+--------+--------+------+--------+-----------------+---------------------------------------------+
        | id      | time       | userid | ip              | course | module | cmid | action | url             | info                                        |
        +---------+------------+--------+-----------------+--------+--------+------+--------+-----------------+---------------------------------------------+
        | 1750905 | 1410438954 |   1982 | 217.124.190.226 |      1 | course |    0 | delete | view.php?id=268 | Everis PR Security Management 12.1 (ID 268) |
        +---------+------------+--------+-----------------+--------+--------+------+--------+-----------------+---------------------------------------------+

        userid => mdl_user.id
        // course  => mdl_course.id
        // module  => mdl_module.name
        // cmid    => mdl_course_modules.id
        // url: id    => mdl_course.id
        info   => course.fullname (?)

        mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'delete';
        +----------+
        | count(*) |
        +----------+
        |       88 |
        +----------+

        As the courses have been deleted, we can restore these records as they are.
        */

    'delete row': undefined,
        /*
        mysql> SELECT * FROM mdl_log WHERE module='course' AND action = 'delete row' ORDER BY id DESC LIMIT 1;
        Empty set (0.00 sec)

        mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'delete row';
        +----------+
        | count(*) |
        +----------+
        |        0 |
        +----------+

        We can leave this.
         */
    'editsection': undefined,
        /*
        mysql> SELECT * FROM mdl_log WHERE module='course' AND action = 'editsection' ORDER BY id DESC LIMIT 1;
        +---------+------------+--------+----------------+--------+--------+------+-------------+------------------------+------+
        | id      | time       | userid | ip             | course | module | cmid | action      | url                    | info |
        +---------+------------+--------+----------------+--------+--------+------+-------------+------------------------+------+
        | 2149699 | 1429869598 |    187 | 10.111.112.125 |     60 | course |    0 | editsection | editsection.php?id=409 | 4    |
        +---------+------------+--------+----------------+--------+--------+------+-------------+------------------------+------+

        userid  => mdl_user.id
        course  => mdl_course.id / mdl_course_modules.course
        // module  => mdl_module.name
        // cmid    => mdl_course_modules.id
        url: id => mdl_course_sections.id / mdl_course_modules.section
        info    => mdl_course_sections.section + 1 (?)

        mdl_course_modules.instance -> mdl_{mdl_module.[mdl_course_modules.module]}.id

        mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'editsection';
        +----------+
        | count(*) |
        +----------+
        |     4662 |
        +----------+
        */

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
