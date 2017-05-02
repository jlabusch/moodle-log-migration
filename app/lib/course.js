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
         info: string => mdl_module.name, number => module ID

         mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'add mod';
         +----------+
         | count(*) |
         +----------+
         |     2772 |
         +----------+
         */
        sql_old:
                'SELECT log.*, ' +
                'u.username AS u_username, u.email AS u_email, ' +
                'c.shortname AS course_shortname ' +
                'FROM mdl_log log ' +
                'LEFT JOIN mdl_course c ON log.course = c.id ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                "WHERE log.module = 'course' " +
                "AND log.action = 'add mod' " +
                "AND " + restrict_clause,

        sql_old_2pass: (row) => {
            let url_id = row.url.match(/id=(\d+)/); // Get cm_id.
            if (!url_id && row.url.match(/id=/)) {
                url_id = [null, row.url];
            }

            let info_id = row.info.match(/[\d]+/); // Get module ID.
            let info_module = row.info.match(/[a-zA-Z]+/); // Get module type.
            if (!info_id) {
                info_id = [null, row.info];
            }

            if (!info_module) {
                info_module = [null, row.info];
            }

            return mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'm.id AS module_id, m.name AS module_name, ' +
                    'mo.name AS module_type_name ' +
                    'FROM mdl_course_modules cm ' +
                    "JOIN mdl_" + info_module + " m ON cm.instance = m.id " +
                    "JOIN mdl_modules mo ON mo.name = '" + info_module + "' " +
                    'WHERE cm.id = ? AND m.id = ?',
                    [
                        url_id[1],
                        info_id[0]
                    ]
                    );
        },

        sql_match: (row) => {

            // Escape \r\n to be able to match with new DB.
            row["module_name"] = row["module_name"].replace(/(?:\\[rn]|[\r\n]+)+/g, "");

            no_tables = ["journal", "bigbluebuttonbn"];
            if (no_tables.indexOf(row.module_type_name) !== -1) {
                return null;
            } else if (row.module_type_name == 'glossary') {
                if (row.cm_id && row.module_id && row.module_name && row.module_type_name) {
                    sql = mysql.format(
                            'SELECT cm.id AS cm_id, ' +
                            'c.id AS course_id, ' +
                            'u.id AS u_userid, ' +
                            'm.id AS module_id ' +
                            'FROM mdl_course_modules cm ' +
                            'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                            'JOIN mdl_modules mo ON mo.id = cm.module ' +
                            "JOIN mdl_" + row.module_type_name + " m ON m.id = cm.instance " +
                            'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                            'WHERE c.shortname = ? AND mo.name = ? AND m.name = ?',
                            [
                                row["u_email"],
                                row["u_username"],
                                row["course_shortname"],
                                row["module_type_name"],
                                row["module_name"]
                            ]
                            );

                    return sql;
                } else {
                    return null;
                }
            } else if (row.module_type_name == 'scorm') {
                if (row.cm_id && row.module_id && row.module_name && row.module_type_name) {
                    sql = mysql.format(
                            'SELECT cm.id AS cm_id, ' +
                            'c.id AS course_id, ' +
                            'u.id AS u_userid, ' +
                            'm.id AS module_id ' +
                            'FROM mdl_course_modules cm ' +
                            'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                            'JOIN mdl_modules mo ON mo.id = cm.module ' +
                            "JOIN mdl_" + row.module_type_name + " m ON m.id = cm.instance " +
                            'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                            'WHERE c.shortname = ? AND mo.name = ? AND m.name = ?',
                            [
                                row["u_email"],
                                row["u_username"],
                                row["course_shortname"],
                                row["module_type_name"],
                                row["module_name"]
                            ]
                            );

                    return sql;
                } else {
                    return null;
                }
            } else if (row.module_type_name == 'assign') {
                if (row.cm_id && row.module_id && row.module_name && row.module_type_name) {
                    sql = mysql.format(
                            'SELECT cm.id AS cm_id, ' +
                            'c.id AS course_id, ' +
                            'u.id AS u_userid, ' +
                            'm.id AS module_id ' +
                            'FROM mdl_course_modules cm ' +
                            'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                            'JOIN mdl_modules mo ON mo.id = cm.module ' +
                            "JOIN mdl_" + row.module_type_name + " m ON m.id = cm.instance " +
                            'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                            'WHERE c.shortname = ? AND mo.name = ? AND m.name = ?',
                            [
                                row["u_email"],
                                row["u_username"],
                                row["course_shortname"],
                                row["module_type_name"],
                                row["module_name"]
                            ]
                            );

                    return sql;
                } else {
                    return null;
                }
            } else if (row.module_type_name == 'page') {
                if (row.cm_id && row.module_id && row.module_name && row.module_type_name) {
                    sql = mysql.format(
                            'SELECT cm.id AS cm_id, ' +
                            'c.id AS course_id, ' +
                            'u.id AS u_userid, ' +
                            'm.id AS module_id ' +
                            'FROM mdl_course_modules cm ' +
                            'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                            'JOIN mdl_modules mo ON mo.id = cm.module ' +
                            "JOIN mdl_" + row.module_type_name + " m ON m.id = cm.instance " +
                            'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                            'WHERE c.shortname = ? AND mo.name = ? AND m.name = ?',
                            [
                                row["u_email"],
                                row["u_username"],
                                row["course_shortname"],
                                row["module_type_name"],
                                row["module_name"]
                            ]
                            );

                    return sql;
                } else {
                    return null;
                }
            } else if (row.module_type_name == 'wiki') {
                if (row.cm_id && row.module_id && row.module_name && row.module_type_name) {
                    sql = mysql.format(
                            'SELECT cm.id AS cm_id, ' +
                            'c.id AS course_id, ' +
                            'u.id AS u_userid, ' +
                            'm.id AS module_id ' +
                            'FROM mdl_course_modules cm ' +
                            'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                            'JOIN mdl_modules mo ON mo.id = cm.module ' +
                            "JOIN mdl_" + row.module_type_name + " m ON m.id = cm.instance " +
                            'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                            'WHERE c.shortname = ? AND mo.name = ? AND m.name = ?',
                            [
                                row["u_email"],
                                row["u_username"],
                                row["course_shortname"],
                                row["module_type_name"],
                                row["module_name"]
                            ]
                            );

                    return sql;
                } else {
                    return null;
                }
            } else if (row.module_type_name == 'quiz') {
                if (row.cm_id && row.module_id && row.module_name && row.module_type_name) {
                    sql = mysql.format(
                            'SELECT cm.id AS cm_id, ' +
                            'c.id AS course_id, ' +
                            'u.id AS u_userid, ' +
                            'm.id AS module_id ' +
                            'FROM mdl_course_modules cm ' +
                            'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                            'JOIN mdl_modules mo ON mo.id = cm.module ' +
                            "JOIN mdl_" + row.module_type_name + " m ON m.id = cm.instance " +
                            'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                            'WHERE c.shortname = ? AND mo.name = ? AND m.name = ?',
                            [
                                row["u_email"],
                                row["u_username"],
                                row["course_shortname"],
                                row["module_type_name"],
                                row["module_name"]
                            ]
                            );

                    return sql;
                } else {
                    return null;
                }
            } else if (row.module_type_name == 'forum') {
                if (row.cm_id && row.module_id && row.module_name && row.module_type_name) {
                    sql = mysql.format(
                            'SELECT cm.id AS cm_id, ' +
                            'c.id AS course_id, ' +
                            'u.id AS u_userid, ' +
                            'm.id AS module_id ' +
                            'FROM mdl_course_modules cm ' +
                            'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                            'JOIN mdl_modules mo ON mo.id = cm.module ' +
                            "JOIN mdl_" + row.module_type_name + " m ON m.id = cm.instance " +
                            'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                            'WHERE c.shortname = ? AND mo.name = ? AND m.name = ?',
                            [
                                row["u_email"],
                                row["u_username"],
                                row["course_shortname"],
                                row["module_type_name"],
                                row["module_name"]
                            ]
                            );

                    return sql;
                } else {
                    return null;
                }
            } else if (row.module_type_name == 'label') {
                if (row.cm_id && row.module_id && row.module_name && row.module_type_name) {
                    sql = mysql.format(
                            'SELECT cm.id AS cm_id, ' +
                            'c.id AS course_id, ' +
                            'u.id AS u_userid, ' +
                            'm.id AS module_id ' +
                            'FROM mdl_course_modules cm ' +
                            'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                            'JOIN mdl_modules mo ON mo.id = cm.module ' +
                            "JOIN mdl_" + row.module_type_name + " m ON m.id = cm.instance " +
                            'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                            'WHERE c.shortname = ? AND mo.name = ? AND m.name = ?',
                            [
                                row["u_email"],
                                row["u_username"],
                                row["course_shortname"],
                                row["module_type_name"],
                                row["module_name"]
                            ]
                            );

                    return sql;
                } else {
                    return null;
                }
            } else if ((row.module_type_name == 'resource') ||
                    (row.module_type_name == 'folder')) {
                if (row.cm_id && row.module_id && row.module_name && row.module_type_name) {
                    sql = mysql.format(
                            'SELECT cm.id AS cm_id, ' +
                            'c.id AS course_id, ' +
                            'u.id AS u_userid, ' +
                            'm.id AS module_id ' +
                            'FROM mdl_course_modules cm ' +
                            'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                            'JOIN mdl_modules mo ON mo.id = cm.module ' +
                            "JOIN mdl_" + row.module_type_name + " m ON m.id = cm.instance " +
                            'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                            'WHERE c.shortname = ? AND mo.name = ? AND m.name = ? AND m.display <> ?',
                            [
                                row["u_email"],
                                row["u_username"],
                                row["course_shortname"],
                                row["module_type_name"],
                                row["module_name"],
                                0
                            ]
                            );
                    return sql;
                } else {
                    return null;
                }
            } else {
                return (row.cm_id && row.module_id && row.module_name && row.module_type_name) ?
                        mysql.format(
                                'SELECT cm.id AS cm_id, ' +
                                'c.id AS course_id, ' +
                                'u.id AS u_userid, ' +
                                'm.id AS module_id ' +
                                'FROM mdl_course_modules cm ' +
                                'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                                'JOIN mdl_modules mo ON mo.id = cm.module ' +
                                "JOIN mdl_" + row.module_type_name + " m ON m.id = cm.instance " +
                                'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                                'WHERE c.shortname = ? AND mo.name = ? AND m.name = ?',
                                [
                                    row["u_email"],
                                    row["u_username"],
                                    row["course_shortname"],
                                    row["module_type_name"],
                                    row["module_name"]
                                ]
                                )
                        :
                        null;
            }
        },

        fixer: function (log_row, old_matches, new_matches) {
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.u_username === nm.u_username || lr.u_email === nm.u_email);
            });
        },

        fn: function (old_row, match_row, next) {
            match_row.cmid = match_row.cm_id || '';
            match_row.course = match_row.course_id || '';
            match_row.userid = match_row.u_userid || '';
            match_row.module_id = match_row.module_id || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cmid);
            var updated_info = old_row.info.replace(/\[\d]+/, match_row.module_id);

            var output = 'INSERT INTO mdl_log ' +
                    '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                    '(' +
                    [
                        old_row.time,
                        match_row.userid,
                        "' " + old_row.ip + "'",
                        match_row.course,
                        "' " + old_row.module + "'",
                        "' " + old_row.cmid + "'",
                        "' " + old_row.action + "'",
                        "' " + updated_url + "'",
                        "' " + updated_info + "'"
                    ].join(',') +
                    ')';
            next && next(null, output);
        }
    },

    'completion updated': {
        /*
         | userid | course | cmid | url                   | info |
         +--------+--------+------+-----------------------+------+
         |      2 |     97 |    0 | completion.php?id=97  |      |
         */
        alias: () => {
            make_alias(library, 'completion updated', 'enrol')
        },

        fn: function (old_row, match_row, next) {
            var updated_url = old_row.url.replace(/id=\d+/, 'id=' + match_row.course);
            var output = 'INSERT INTO mdl_log ' +
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
    'editsection': {
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
        sql_old:
                'SELECT log.*, ' +
                'u.username AS u_username, u.email AS u_email, ' +
                'c.shortname AS course_shortname ' +
                'FROM mdl_log log ' +
                'LEFT JOIN mdl_course c ON log.course = c.id ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                "WHERE log.module = 'course' " +
                "AND log.action = 'editsection' " +
                "AND " + restrict_clause,

        sql_old_2pass: (row) => {
            let url_id = row.url.match(/id=(\d+)/); // Get course_section id.
            if (!url_id && row.url.match(/id=/)) {
                url_id = [null, row.url];
            }

            return mysql.format(
                    'SELECT cs.section AS cs_section, cs.name AS cs_name ' +
                    'FROM mdl_course_sections cs ' +
                    'WHERE cs.id = ? ',
                    [
                        url_id[1]
                    ]
                    );
        },

        sql_match: (row) => {
            return (row.cs_name && row.cs_section) ?
                    mysql.format(
                            'SELECT u.id AS u_userid, ' +
                            'c.id AS course_id, ' +
                            'cs.id AS cs_id, cs.section AS cs_section ' +
                            'FROM mdl_course_sections cs ' +
                            'LEFT JOIN mdl_course c ON c.id = cs.course ' +
                            'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                            'WHERE c.shortname = ? AND cs.name = ?',
                            [
                                row["u_email"],
                                row["u_username"],
                                row["course_shortname"],
                                row["cs_name"]
                            ]
                            )
                    :
                    null;
        },

        fixer: function (log_row, old_matches, new_matches) {
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.u_username === nm.u_username || lr.u_email === nm.u_email);
            });
        },

        fn: function (old_row, match_row, next) {
            match_row.course = match_row.course_id || '';
            match_row.userid = match_row.u_userid || '';
            match_row.cs_id = match_row.cs_id || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cs_id);

            var updated_info = (match_row.cs_section + 1);

            var output = 'INSERT INTO mdl_log ' +
                    '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                    '(' +
                    [
                        old_row.time,
                        match_row.userid,
                        "' " + old_row.ip + "'",
                        match_row.course,
                        "' " + old_row.module + "'",
                        "' " + old_row.cmid + "'",
                        "' " + old_row.action + "'",
                        "' " + updated_url + "'",
                        "' " + updated_info + "'"
                    ].join(',') +
                    ')';
            next && next(null, output);
        }
    },

    'enrol': {
        /*
         | userid | course | cmid | url                      | info |
         +--------+--------+------+--------------------------+------+
         |   1566 |     20 |    0 | view.php?id=20           | 20   |
         |   3086 |     20 |    0 | ../enrol/users.php?id=20 | 20   |
         */
        sql_old: 'SELECT log.*, ' +
                '       u.email, u.username, ' +
                '       c.shortname AS course_shortname ' +
                'FROM mdl_log log ' +
                'JOIN mdl_user u on u.id = log.userid ' +
                'JOIN mdl_course c ON c.id = log.course ' +
                "WHERE log.module = 'course' AND log.action = 'enrol' AND " + restrict_clause,

        sql_match: (row) => {
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

        fixer: function (log_row, old_matches, new_matches) {
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.username;
            });
        },

        fn: function (old_row, match_row, next) {
            var updated_url = old_row.url.replace(/id=\d+/, 'id=' + match_row.course);
            var output = 'INSERT INTO mdl_log ' +
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

    'guest': undefined,
    /*
     | id    | time       | userid | ip            | course | module | cmid |...
     +-------+------------+--------+---------------+--------+--------+------+...
     | 28757 | 1255679386 |      1 | 212.163.190.6 |     20 | course |    0 |...

     ...| action | url            | info          |
     ...+--------+----------------+---------------+
     ...| guest  | view.php?id=20 | 212.163.190.6 |

     "guest" has only a single row (below). Not worth writing code for.
     */


    'new': {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='course' AND action = 'new' ORDER BY id LIMIT 1;
         +-----+------------+--------+-----------+--------+--------+------+--------+---------------+--------------------------+
         | id  | time       | userid | ip        | course | module | cmid | action | url           | info                     |
         +-----+------------+--------+-----------+--------+--------+------+--------+---------------+--------------------------+
         | 217 | 1245224977 |      2 | 127.0.0.1 |      1 | course |    0 | new    | view.php?id=2 | Curso a distancia (ID 2) |
         +-----+------------+--------+-----------+--------+--------+------+--------+---------------+--------------------------+

         userid => mdl_user.id
         // course  => mdl_course.id
         // module  => mdl_module.name
         // cmid    => mdl_course_modules.id
         url: id    => mdl_course.id
         info   => course.fullname (?), ID => mdl_course.id

         mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'delete';
         +----------+
         | count(*) |
         +----------+
         |       88 |
         +----------+
         */
        sql_old:
                'SELECT log.*, ' +
                'u.id, u.username AS u_username, u.email AS u_email ' +
                'FROM mdl_log log ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                "WHERE log.module = 'course' " +
                "AND log.action = 'new' " +
                "AND " + restrict_clause,

        sql_old_2pass: (row) => {
            let url_id = row.url.match(/\d+/); // Get course id.
            if (!url_id) {
                url_id = [null, row.url];
            }
            return mysql.format(
                    'SELECT c.id AS course_id, c.shortname AS course_shortname ' +
                    'FROM mdl_course c ' +
                    'WHERE c.id = ? ',
                    [
                        url_id[0]
                    ]
                    );
        },

        sql_match: (row) => {
            return (row.course_shortname) ?
                    mysql.format(
                            'SELECT u.id AS u_userid, ' +
                            'c.id AS course_id, c.shortname AS course_shortname ' +
                            'FROM mdl_course c ' +
                            'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                            'WHERE c.shortname = ? ',
                            [
                                row["u_email"],
                                row["u_username"],
                                row["course_shortname"]
                            ]
                            )
                    :
                    null;
        },

        fixer: function (log_row, old_matches, new_matches) {
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.u_username === nm.u_username || lr.u_email === nm.u_email);
            });
        },

        fn: function (old_row, match_row, next) {
            match_row.course = match_row.course_id || '';
            match_row.course_shortname = match_row.course_shortname || '';
            match_row.userid = match_row.u_userid || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.course);

            var updated_info = match_row.course_shortname + ' (ID ' + match_row.course + ')';

            var output = 'INSERT INTO mdl_log ' +
                    '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                    '(' +
                    [
                        old_row.time,
                        match_row.userid,
                        "' " + old_row.ip + "'",
                        match_row.course,
                        "' " + old_row.module + "'",
                        "' " + old_row.cmid + "'",
                        "' " + old_row.action + "'",
                        "' " + updated_url + "'",
                        "' " + updated_info + "'"
                    ].join(',') +
                    ')';
            next && next(null, output);
        }
    },

    'recent': {
        /*
         | userid | course | cmid | url               | info |
         +--------+--------+------+-------------------+------+
         |     21 |     18 |    0 | recent.php?id=18  |      |
         |   3132 |    274 |    0 | recent.php?id=274 | 274  |
         */
        alias: () => {
            make_alias(library, 'recent', 'enrol')
        },

        fn: function (old_row, match_row, next) {
            var updated_url = old_row.url.replace(/id=\d+/, 'id=' + match_row.course);
            var output = 'INSERT INTO mdl_log ' +
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

    'report live': {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='course' AND action = 'report live' ORDER BY id DESC LIMIT 1;
         +---------+------------+--------+----------------+--------+--------+------+-------------+---------------------------------+------+
         | id      | time       | userid | ip             | course | module | cmid | action      | url                             | info |
         +---------+------------+--------+----------------+--------+--------+------+-------------+---------------------------------+------+
         | 2156334 | 1430136446 |   1613 | 195.20.146.189 |    243 | course |    0 | report live | report/loglive/index.php?id=243 | 243  |
         +---------+------------+--------+----------------+--------+--------+------+-------------+---------------------------------+------+

         userid => mdl_user.id
         // course  => mdl_course.id
         // module  => mdl_module.name
         // cmid    => mdl_course_modules.id
         url: id    => mdl_course.id
         info   => course.fullname (?)

         mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'report live';
         +----------+
         | count(*) |
         +----------+
         |      262 |
         +----------+
         */
        sql_old:
                'SELECT log.*, ' +
                'u.id, u.username AS u_username, u.email AS u_email ' +
                'FROM mdl_log log ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                "WHERE log.module = 'course' " +
                "AND log.action = 'report live' " +
                "AND " + restrict_clause,

        sql_old_2pass: (row) => {
            let url_id = row.url.match(/\d+/); // Get course id.
            if (!url_id) {
                url_id = [null, row.url];
            }

            return mysql.format(
                    'SELECT c.id AS course_id, c.shortname AS course_shortname ' +
                    'FROM mdl_course c ' +
                    'WHERE c.id = ? ',
                    [
                        url_id[0]
                    ]
                    );
        },

        sql_match: (row) => {
            return (row.course_shortname) ?
                    mysql.format(
                            'SELECT u.id AS u_userid, ' +
                            'c.id AS course_id, c.shortname AS course_shortname ' +
                            'FROM mdl_course c ' +
                            'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                            'WHERE c.shortname = ? ',
                            [
                                row["u_email"],
                                row["u_username"],
                                row["course_shortname"]
                            ]
                            )
                    :
                    null;
        },

        fixer: function (log_row, old_matches, new_matches) {
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.u_username === nm.u_username || lr.u_email === nm.u_email);
            });
        },

        fn: function (old_row, match_row, next) {
            match_row.course = match_row.course_id || '';
            match_row.course_shortname = match_row.course_shortname || '';
            match_row.userid = match_row.u_userid || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.course);

            var updated_info = match_row.course;

            var output = 'INSERT INTO mdl_log ' +
                    '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                    '(' +
                    [
                        old_row.time,
                        match_row.userid,
                        "' " + old_row.ip + "'",
                        match_row.course,
                        "' " + old_row.module + "'",
                        "' " + old_row.cmid + "'",
                        "' " + old_row.action + "'",
                        "' " + updated_url + "'",
                        "' " + updated_info + "'"
                    ].join(',') +
                    ')';
            next && next(null, output);
        }
    },

    'report log': {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='course' AND action = 'report log' ORDER BY id DESC LIMIT 1;
         +---------+------------+--------+----------------+--------+--------+------+------------+-----------------------------+------+
         | id      | time       | userid | ip             | course | module | cmid | action     | url                         | info |
         +---------+------------+--------+----------------+--------+--------+------+------------+-----------------------------+------+
         | 2156350 | 1430136640 |   1613 | 195.20.146.189 |    243 | course |    0 | report log | report/log/index.php?id=243 | 243  |
         +---------+------------+--------+----------------+--------+--------+------+------------+-----------------------------+------+

         userid => mdl_user.id
         // course  => mdl_course.id
         // module  => mdl_module.name
         // cmid    => mdl_course_modules.id
         url: id    => mdl_course.id
         info   => course.id

         mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'report log';
         +----------+
         | count(*) |
         +----------+
         |     2137 |
         +----------+
         */
        sql_old:
                'SELECT log.*, ' +
                'u.id, u.username AS u_username, u.email AS u_email ' +
                'FROM mdl_log log ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                "WHERE log.module = 'course' " +
                "AND log.action = 'report log' " +
                "AND " + restrict_clause,

        sql_old_2pass: (row) => {
            let url_id = row.url.match(/\d+/); // Get course id.
            if (!url_id) {
                url_id = [null, row.url];
            }

            return mysql.format(
                    'SELECT c.id AS course_id, c.shortname AS course_shortname ' +
                    'FROM mdl_course c ' +
                    'WHERE c.id = ? ',
                    [
                        url_id[0]
                    ]
                    );
        },

        sql_match: (row) => {
            return (row.course_shortname) ?
                    mysql.format(
                            'SELECT u.id AS u_userid, ' +
                            'c.id AS course_id, c.shortname AS course_shortname ' +
                            'FROM mdl_course c ' +
                            'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                            'WHERE c.shortname = ? ',
                            [
                                row["u_email"],
                                row["u_username"],
                                row["course_shortname"]
                            ]
                            )
                    :
                    null;
        },

        fixer: function (log_row, old_matches, new_matches) {
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.u_username === nm.u_username || lr.u_email === nm.u_email);
            });
        },

        fn: function (old_row, match_row, next) {
            match_row.course = match_row.course_id || '';
            match_row.course_shortname = match_row.course_shortname || '';
            match_row.userid = match_row.u_userid || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.course);

            var updated_info = match_row.course;

            var output = 'INSERT INTO mdl_log ' +
                    '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                    '(' +
                    [
                        old_row.time,
                        match_row.userid,
                        "' " + old_row.ip + "'",
                        match_row.course,
                        "' " + old_row.module + "'",
                        "' " + old_row.cmid + "'",
                        "' " + old_row.action + "'",
                        "' " + updated_url + "'",
                        "' " + updated_info + "'"
                    ].join(',') +
                    ')';
            next && next(null, output);
        }
    },

    'report outline': undefined,
    /*
     mysql> SELECT * FROM mdl_log WHERE module='course' AND action = 'report outline' ORDER BY id DESC LIMIT 1;
     +---------+------------+--------+----------------+--------+--------+------+----------------+---------------------------------+------+
     | id      | time       | userid | ip             | course | module | cmid | action         | url                             | info |
     +---------+------------+--------+----------------+--------+--------+------+----------------+---------------------------------+------+
     | 2156333 | 1430136438 |   1613 | 195.20.146.189 |    243 | course |    0 | report outline | report/outline/index.php?id=243 | 243  |
     +---------+------------+--------+----------------+--------+--------+------+----------------+---------------------------------+------+

     userid => mdl_user.id
     // course  => mdl_course.id
     // module  => mdl_module.name
     // cmid    => mdl_course_modules.id
     url: id    => mdl_course.id
     info   => course.fullname (?)

     mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'report outline';
     +----------+
     | count(*) |
     +----------+
     |     2152 |
     +----------+
     */

    'report participation': {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='course' AND action = 'report participation' ORDER BY id DESC LIMIT 1;
         +---------+------------+--------+----------------+--------+--------+------+----------------------+---------------------------------------+------+
         | id      | time       | userid | ip             | course | module | cmid | action               | url                                   | info |
         +---------+------------+--------+----------------+--------+--------+------+----------------------+---------------------------------------+------+
         | 2156335 | 1430136454 |   1613 | 195.20.146.189 |    243 | course |    0 | report participation | report/participation/index.php?id=243 | 243  |
         +---------+------------+--------+----------------+--------+--------+------+----------------------+---------------------------------------+------+

         userid => mdl_user.id
         // course  => mdl_course.id
         // module  => mdl_module.name
         // cmid    => mdl_course_modules.id
         url: id    => mdl_course.id
         info   => course.id

         mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'report participation';
         +----------+
         | count(*) |
         +----------+
         |      873 |
         +----------+
         */
        sql_old:
                'SELECT log.*, ' +
                'u.id, u.username AS u_username, u.email AS u_email ' +
                'FROM mdl_log log ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                "WHERE log.module = 'course' " +
                "AND log.action = 'report participation' " +
                "AND " + restrict_clause,

        sql_old_2pass: (row) => {
            let url_id = row.url.match(/\d+/); // Get course id.
            if (!url_id) {
                url_id = [null, row.url];
            }

            return mysql.format(
                    'SELECT c.id AS course_id, c.shortname AS course_shortname ' +
                    'FROM mdl_course c ' +
                    'WHERE c.id = ? ',
                    [
                        url_id[0]
                    ]
                    );
        },

        sql_match: (row) => {
            return (row.course_shortname) ?
                    mysql.format(
                            'SELECT u.id AS u_userid, ' +
                            'c.id AS course_id, c.shortname AS course_shortname ' +
                            'FROM mdl_course c ' +
                            'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                            'WHERE c.shortname = ? ',
                            [
                                row["u_email"],
                                row["u_username"],
                                row["course_shortname"]
                            ]
                            )
                    :
                    null;
        },

        fixer: function (log_row, old_matches, new_matches) {
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.u_username === nm.u_username || lr.u_email === nm.u_email);
            });
        },

        fn: function (old_row, match_row, next) {
            match_row.course = match_row.course_id || '';
            match_row.course_shortname = match_row.course_shortname || '';
            match_row.userid = match_row.u_userid || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.course);

            var updated_info = match_row.course;

            var output = 'INSERT INTO mdl_log ' +
                    '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                    '(' +
                    [
                        old_row.time,
                        match_row.userid,
                        "' " + old_row.ip + "'",
                        match_row.course,
                        "' " + old_row.module + "'",
                        "' " + old_row.cmid + "'",
                        "' " + old_row.action + "'",
                        "' " + updated_url + "'",
                        "' " + updated_info + "'"
                    ].join(',') +
                    ')';
            next && next(null, output);
        }
    },

    'report stats': undefined,
    /*
     mysql> SELECT * FROM mdl_log WHERE module='course' AND action = 'report stats' ORDER BY id DESC LIMIT 1;
     +---------+------------+--------+----------------+--------+--------+------+--------------+--------------------------------------------------------+------+
     | id      | time       | userid | ip             | course | module | cmid | action       | url                                                    | info |
     +---------+------------+--------+----------------+--------+--------+------+--------------+--------------------------------------------------------+------+
     | 2156342 | 1430136494 |   1613 | 195.20.146.189 |    243 | course |    0 | report stats | report/stats/graph.php?userid=0&id=243&mode=1&roleid=4 | 243  |
     +---------+------------+--------+----------------+--------+--------+------+--------------+--------------------------------------------------------+------+

     userid => mdl_user.id
     // course  => mdl_course.id
     // module  => mdl_module.name
     // cmid    => mdl_course_modules.id
     url: id    => mdl_course.id
     info   => course.fullname (?)

     mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'report stats';
     +----------+
     | count(*) |
     +----------+
     |     1099 |
     +----------+
     */

    'unenrol': undefined,
        /*
         mysql> SELECT * FROM mdl_log WHERE module='course' AND action = 'unenrol' ORDER BY id DESC LIMIT 1;
         +---------+------------+--------+-----------+--------+--------+------+---------+--------------------------+------+
         | id      | time       | userid | ip        | course | module | cmid | action  | url                      | info |
         +---------+------------+--------+-----------+--------+--------+------+---------+--------------------------+------+
         | 2107985 | 1428426205 |      2 | 10.0.0.41 |     52 | course |    0 | unenrol | ../enrol/users.php?id=52 | 52   |
         +---------+------------+--------+-----------+--------+--------+------+---------+--------------------------+------+

         userid => mdl_user.id
         // course  => mdl_course.id
         // module  => mdl_module.name
         // cmid    => mdl_course_modules.id
         url: id    => mdl_course.id
         info   => course.fullname (?)

         mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'unenrol';
         +----------+
         | count(*) |
         +----------+
         |      150 |
         +----------+
         */

    'update': undefined,
    /*
     mysql> SELECT * FROM mdl_log WHERE module='course' AND action = 'update' ORDER BY id DESC LIMIT 1;
     +---------+------------+--------+-----------+--------+--------+------+--------+-----------------+------+
     | id      | time       | userid | ip        | course | module | cmid | action | url             | info |
     +---------+------------+--------+-----------+--------+--------+------+--------+-----------------+------+
     | 2156635 | 1430143023 |      2 | 10.0.0.41 |    211 | course |    0 | update | edit.php?id=211 | 211  |
     +---------+------------+--------+-----------+--------+--------+------+--------+-----------------+------+

     userid => mdl_user.id
     // course  => mdl_course.id
     // module  => mdl_module.name
     // cmid    => mdl_course_modules.id
     url: id    => mdl_course.id
     info   => course.fullname (?)

     mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'update';
     +----------+
     | count(*) |
     +----------+
     |      854 |
     +----------+
     */

    'update mod': undefined,
    /*
     mysql> SELECT * FROM mdl_log WHERE module='course' AND action = 'update mod' ORDER BY id DESC LIMIT 1;
     +---------+------------+--------+----------------+--------+--------+------+------------+-------------------------------+-----------+
     | id      | time       | userid | ip             | course | module | cmid | action     | url                           | info      |
     +---------+------------+--------+----------------+--------+--------+------+------------+-------------------------------+-----------+
     | 2156908 | 1430146900 |   1808 | 10.111.112.125 |    274 | course |    0 | update mod | ../mod/page/view.php?id=25570 | page 3142 |
     +---------+------------+--------+----------------+--------+--------+------+------------+-------------------------------+-----------+

     userid => mdl_user.id
     // course  => mdl_course.id
     // module  => mdl_module.name
     // cmid    => mdl_course_modules.id
     url: id    => mdl_course.id
     info   => course.fullname (?)

     mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'update mod';
     +----------+
     | count(*) |
     +----------+
     |    19471 |
     +----------+
     */

    'user report': undefined,
    /*
     mysql> SELECT * FROM mdl_log WHERE module='course' AND action = 'user report' ORDER BY id DESC LIMIT 1;
     +---------+------------+--------+----------------+--------+--------+------+-------------+--------------------------------------+------+
     | id      | time       | userid | ip             | course | module | cmid | action      | url                                  | info |
     +---------+------------+--------+----------------+--------+--------+------+-------------+--------------------------------------+------+
     | 2046040 | 1426014890 |      2 | 10.111.112.125 |    296 | course |    0 | user report | user.php?id=296&user=2878&mode=grade | 2878 |
     +---------+------------+--------+----------------+--------+--------+------+-------------+--------------------------------------+------+

     userid => mdl_user.id
     // course  => mdl_course.id
     // module  => mdl_module.name
     // cmid    => mdl_course_modules.id
     url: id    => mdl_course.id
     info   => course.fullname (?)

     mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'user report';
     +----------+
     | count(*) |
     +----------+
     |     8082 |
     +----------+
     */

    'view': undefined,
    /*
     mysql> SELECT * FROM mdl_log WHERE module='course' AND action = 'view' ORDER BY id DESC LIMIT 1;
     +---------+------------+--------+---------------+--------+--------+------+--------+---------------+------+
     | id      | time       | userid | ip            | course | module | cmid | action | url           | info |
     +---------+------------+--------+---------------+--------+--------+------+--------+---------------+------+
     | 2158226 | 1430200990 |   1666 | 176.34.113.55 |      1 | course |    0 | view   | view.php?id=1 | 1    |
     +---------+------------+--------+---------------+--------+--------+------+--------+---------------+------+

     userid => mdl_user.id
     // course  => mdl_course.id
     // module  => mdl_module.name
     // cmid    => mdl_course_modules.id
     url: id    => mdl_course.id
     info   => course.fullname (?)

     mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'view';
     +----------+
     | count(*) |
     +----------+
     |   473665 |
     +----------+
     */

    'view section': undefined
            /*
             mysql> SELECT * FROM mdl_log WHERE module='course' AND action = 'view section' ORDER BY id DESC LIMIT 1;
             +---------+------------+--------+--------------+--------+--------+------+--------------+--------------------------------+------+
             | id      | time       | userid | ip           | course | module | cmid | action       | url                            | info |
             +---------+------------+--------+--------------+--------+--------+------+--------------+--------------------------------+------+
             | 2158159 | 1430197031 |   3170 | 88.6.118.161 |    274 | course |    0 | view section | view.php?id=274&sectionid=2738 | 2738 |
             +---------+------------+--------+--------------+--------+--------+------+--------------+--------------------------------+------+

             userid => mdl_user.id
             // course  => mdl_course.id
             // module  => mdl_module.name
             // cmid    => mdl_course_modules.id
             url: id    => mdl_course.id
             info   => course.fullname (?)

             mysql> SELECT count(*) FROM mdl_log WHERE module='course' AND action = 'view section';
             +----------+
             | count(*) |
             +----------+
             |    19177 |
             +----------+
             */

};

module.exports = library;
