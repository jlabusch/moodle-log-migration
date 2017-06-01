var restrict_clause = require('./sql_restrictions.js')(),
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql'),
    dbs = require('./dbs.js');

/*
 mysql> select action,count(*) from mdl_log where module='assign' group by action;
 +-------------------------------+----------+
 | action                        | count(*) |
 +-------------------------------+----------+
 | add                           |      315 |
 | download all submissions      |       14 |
 | grade submission              |     3201 |
 | lock submission               |       14 |
 | revert submission to draft    |       13 |
 | submit                        |     3308 |
 | submit for grading            |     1193 |
 | unlock submission             |       58 |
 | update                        |     5665 |
 | update grades                 |     3319 |
 | upload                        |     3968 |
 | view                          |   133184 |
 | view all                      |     1410 |
 | view feedback                 |      599 |
 | view grading form             |     3972 |
 | view submission               |     8023 |
 | view submission grading table |     9930 |
 | view submit assignment form   |     4975 |
 +-------------------------------+----------+
 */

var library = {
    "add": {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'add' ORDER BY id DESC LIMIT 1;
         +---------+------------+--------+----------------+--------+--------+-------+--------+-------------------+------+
         | id      | time       | userid | ip             | course | module | cmid  | action | url               | info |
         +---------+------------+--------+----------------+--------+--------+-------+--------+-------------------+------+
         | 1976864 | 1424085174 |    185 | 10.111.112.125 |    274 | assign | 24348 | add    | view.php?id=24348 | 3937 |
         +---------+------------+--------+----------------+--------+--------+-------+--------+-------------------+------+

         userid  => mdl_user.id
         course  => mdl_course.id
         module  => mdl_module.name
         cmid    => mdl_course_modules.id
         url: id => cmid
         info    => mdl_assign.id

         mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'add';
         +----------+
         | count(*) |
         +----------+
         |      315 |
         +----------+
         */

        sql_old:
            'SELECT log.*, ' +
            'u.username AS u_username, u.email AS u_email, ' +
            'c.shortname AS course_shortname, ' +
            'a.name AS assign_name ' +
            'FROM mdl_log log ' +
            'LEFT JOIN mdl_course c ON log.course = c.id ' +
            'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
            'LEFT JOIN mdl_assign a ON cm.instance = a.id ' +
            'JOIN mdl_user u ON log.userid = u.id ' +
            "WHERE log.module = 'assign' " +
            "AND log.action = 'add' " +
            "AND " + restrict_clause,

        sql_match: (row) => {
            return row.assign_name ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'c.id AS course_id , ' +
                    'a.id AS a_id, a.name AS a_name, ' +
                    'u.id AS u_userid, u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_assign a ON a.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND a.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'assign',
                        row["course_shortname"],
                        row["assign_name"],
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
            match_row.userid = match_row.u_userid || '';
            match_row.course = match_row.course_id || '';
            match_row.cmid = match_row.cm_id || '';
            match_row.a_id = match_row.a_id || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cmid);
            var output = 'INSERT INTO mdl_log ' +
                '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                '(' +
                [
                    old_row.time,
                    match_row.userid,
                    "'" + old_row.ip + "'",
                    match_row.course,
                    "'" + old_row.module + "'",
                    match_row.cmid,
                    "'" + old_row.action + "'",
                    "'" + updated_url + "'",
                    "'" + match_row.a_id + "'"
                ].join(',') +
                ')';
            next && next(null, output);
        }
    },

    "download all submissions": {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'download all submissions' LIMIT 1;
         +---------+------------+--------+---------------+--------+--------+-------+--------------------------+-------------------+--------------------------+
         | id      | time       | userid | ip            | course | module | cmid  | action                   | url               | info                     |
         +---------+------------+--------+---------------+--------+--------+-------+--------------------------+-------------------+--------------------------+
         | 1034844 | 1366648823 |   1238 | 212.163.190.6 |     34 | assign | 10992 | download all submissions | view.php?id=10992 | Download all submissions |
         +---------+------------+--------+---------------+--------+--------+-------+--------------------------+-------------------+--------------------------+

         userid  => mdl_user.id
         course  => mdl_course.id
         module  => mdl_module.name
         cmid    => mdl_course_modules.id
         url: id => cmid
         info    =>

         mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'download all submissions';
         +----------+
         | count(*) |
         +----------+
         |       14 |
         +----------+
         */

        sql_old:
            'SELECT log.*, ' +
            'u.username AS u_username, u.email AS u_email, ' +
            'c.shortname AS course_shortname, ' +
            'a.name AS assign_name ' +
            'FROM mdl_log log ' +
            'LEFT JOIN mdl_course c ON log.course = c.id ' +
            'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
            'LEFT JOIN mdl_assign a ON cm.instance = a.id ' +
            'JOIN mdl_user u ON log.userid = u.id ' +
            "WHERE log.module = 'assign' " +
            "AND log.action = 'download all submissions' " +
            "AND " + restrict_clause,

        sql_match: (row) => {
            return row.assign_name ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'c.id AS course_id , ' +
                    'a.id AS a_id, a.name AS a_name, ' +
                    'u.id AS u_userid, u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_assign a ON a.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND a.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'assign',
                        row["course_shortname"],
                        row["assign_name"],
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
            match_row.userid = match_row.u_userid || '';
            match_row.course = match_row.course_id || '';
            match_row.cmid = match_row.cm_id || '';
            match_row.a_id = match_row.a_id || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cmid);
            var output = 'INSERT INTO mdl_log ' +
                '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                '(' +
                [
                    old_row.time,
                    match_row.userid,
                    "'" + old_row.ip + "'",
                    match_row.course,
                    "'" + old_row.module + "'",
                    match_row.cmid,
                    "'" + old_row.action + "'",
                    "'" + updated_url + "'",
                    "'" + match_row.a_id + "'"
                ].join(',') +
                ')';
            next && next(null, output);
        }
    },

    "grade submission": {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'grade submission' LIMIT 1;
         +--------+------------+--------+--------------+--------+--------+------+------------------+------------------+----------------------------------------------------------------------------------------------------------------------------------------+
         | id     | time       | userid | ip           | course | module | cmid | action           | url              | info                                                                                                                                   |
         +--------+------------+--------+--------------+--------+--------+------+------------------+------------------+----------------------------------------------------------------------------------------------------------------------------------------+
         | 964448 | 1363480570 |     48 | 88.17.189.23 |     97 | assign | 9574 | grade submission | view.php?id=9574 | Grade student: (id=1300, fullname=Montse Pairo). Grade: <input type="hidden" name="grademodified_0" value="0"/>9.00&nbsp;/&nbsp;9.00.  |
         +--------+------------+--------+--------------+--------+--------+------+------------------+------------------+----------------------------------------------------------------------------------------------------------------------------------------+

         userid  => mdl_user.id
         course  => mdl_course.id
         module  => mdl_module.name
         cmid    => mdl_course_modules.id
         url: id => cmid
         info: id => mdl_user.id, fullname => fullname(id)

         mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'grade submission';
         +----------+
         | count(*) |
         +----------+
         |     3201 |
         +----------+
         */

        sql_old:
            'SELECT log.*, ' +
            'u.username AS u_username, u.email AS u_email, ' +
            'c.shortname AS course_shortname, ' +
            'a.name AS assign_name ' +
            'FROM mdl_log log ' +
            'LEFT JOIN mdl_course c ON log.course = c.id ' +
            'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
            'LEFT JOIN mdl_assign a ON cm.instance = a.id ' +
            'JOIN mdl_user u ON log.userid = u.id ' +
            "WHERE log.module = 'assign' " +
            "AND log.action = 'grade submission' " +
            "AND " + restrict_clause,

        sql_old_2pass: (row) => {
            let id = row.info.match(/id=(\d+)/); // Get user ID of info_user.
            if (!id && row.info.match(/id=/)) {
                id = [null, row.info];
            }
            return mysql.format(
                'SELECT u.id AS info_user_id, ' +
                '       u.email AS info_user_email, ' +
                '       u.username AS info_user_username, ' +
                '       u.firstname AS info_user_firstname, ' +
                '       u.lastname AS info_user_lastname ' +
                'FROM mdl_user u ' +
                'WHERE id = ?',
                [
                    id[1]
                ]
                );
        },

        sql_match: (row) => {
            return row.assign_name ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'c.id AS course_id , ' +
                    'a.id AS a_id, a.name AS a_name, ' +
                    'u.id AS u_userid, u.username AS u_username, u.email AS u_email, ' +
                    'info_user.id AS info_user_id, info_user.username AS info_user_username, info_user.email AS info_user_email, ' +
                    'info_user.firstname AS info_user_firstname, info_user.lastname AS info_user_lastname ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_assign a ON a.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'JOIN mdl_user info_user ON (BINARY info_user.email = ? OR info_user.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND a.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        row["info_user_email"],
                        row["info_user_username"],
                        'assign',
                        row["course_shortname"],
                        row["assign_name"]
                    ]
                )
                :
                null;
        },

        fixer: function (log_row, old_matches, new_matches) {
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                var match_1 = (lr.u_username === nm.u_username || lr.u_email === nm.u_email);
                var match_2 = (lr.info_user_username === nm.info_user_username || lr.info_user_email === nm.info_user_email);
                return (match_1 && match_2);
            });
        },

        fn: function (old_row, match_row, next) {
            match_row.userid = match_row.u_userid || '';
            match_row.course = match_row.course_id || '';
            match_row.cmid = match_row.cm_id || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cmid);

            match_row.info_user_id = match_row.info_user_id || '';
            match_row.info_user_firstname = match_row.info_user_firstname || '';
            match_row.info_user_lastname = match_row.info_user_lastname || '';

            var re_id = new RegExp(/id=\d+/);
            var with_id = 'id=' + match_row.info_user_id;
            var updated_info_first = old_row.info.replace(re_id, with_id);

            var fullname = match_row.info_user_firstname + ' ' + match_row.info_user_lastname;
            var re_fn = new RegExp(/fullname=[^)]+/);
            var with_fn = 'fullname=' + fullname;

            var updated_info = updated_info_first.replace(re_fn, with_fn);

            let info = `?`;
            info = dbs.mysql_to_postgres(mysql.format(info, [updated_info]));
            var output = 'INSERT INTO mdl_log ' +
                '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                '(' +
                [
                    old_row.time,
                    match_row.userid,
                    "'" + old_row.ip + "'",
                    match_row.course,
                    "'" + old_row.module + "'",
                    match_row.cmid,
                    "'" + old_row.action + "'",
                    "'" + updated_url + "'",
                    info
                ].join(',') +
                ')';
            next && next(null, output);
        }
    },

    "lock submission": {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'lock submission' LIMIT 1;
         +---------+------------+--------+---------------+--------+--------+------+-----------------+------------------+-------------------------------------------------------------------------------+
         | id      | time       | userid | ip            | course | module | cmid | action          | url              | info                                                                          |
         +---------+------------+--------+---------------+--------+--------+------+-----------------+------------------+-------------------------------------------------------------------------------+
         | 1011147 | 1365405105 |   1667 | 212.163.190.6 |     97 | assign | 9606 | lock submission | view.php?id=9606 | Prevent any more submissions for student: (id=1438, fullname=Niyongabo Come). |
         +---------+------------+--------+---------------+--------+--------+------+-----------------+------------------+-------------------------------------------------------------------------------+

         userid  => mdl_user.id
         course  => mdl_course.id
         module  => mdl_module.name
         cmid    => mdl_course_modules.id
         url: id => cmid
         info: id => mdl_user.id, fullname => fullname(id)

         mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'lock submission';
         +----------+
         | count(*) |
         +----------+
         |       14 |
         +----------+
         */

        sql_old:
            'SELECT log.*, ' +
            'u.username AS u_username, u.email AS u_email, ' +
            'c.shortname AS course_shortname, ' +
            'a.name AS assign_name ' +
            'FROM mdl_log log ' +
            'LEFT JOIN mdl_course c ON log.course = c.id ' +
            'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
            'LEFT JOIN mdl_assign a ON cm.instance = a.id ' +
            'JOIN mdl_user u ON log.userid = u.id ' +
            "WHERE log.module = 'assign' " +
            "AND log.action = 'lock submission' " +
            "AND " + restrict_clause,

        sql_old_2pass: (row) => {
            let id = row.info.match(/id=(\d+)/); // Get user ID of info_user.
            if (!id && row.info.match(/id=/)) {
                id = [null, row.info];
            }
            return mysql.format(
                'SELECT u.id AS info_user_id, ' +
                '       u.email AS info_user_email, ' +
                '       u.username AS info_user_username, ' +
                '       u.firstname AS info_user_firstname, ' +
                '       u.lastname AS info_user_lastname ' +
                'FROM mdl_user u ' +
                'WHERE id = ?',
                [
                    id[1]
                ]
            );
        },

        sql_match: (row) => {
            return row.assign_name ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'c.id AS course_id , ' +
                    'a.id AS a_id, a.name AS a_name, ' +
                    'u.id AS u_userid, u.username AS u_username, u.email AS u_email, ' +
                    'info_user.id AS info_user_id, info_user.username AS info_user_username, info_user.email AS info_user_email, ' +
                    'info_user.firstname AS info_user_firstname, info_user.lastname AS info_user_lastname ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_assign a ON a.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'JOIN mdl_user info_user ON (BINARY info_user.email = ? OR info_user.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND a.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        row["info_user_email"],
                        row["info_user_username"],
                        'assign',
                        row["course_shortname"],
                        row["assign_name"]
                    ]
                )
                :
                null;
        },

        fixer: function (log_row, old_matches, new_matches) {
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                var match_1 = (lr.u_username === nm.u_username || lr.u_email === nm.u_email);
                var match_2 = (lr.info_user_username === nm.info_user_username || lr.info_user_email === nm.info_user_email);
                return (match_1 && match_2);
            });
        },

        fn: function (old_row, match_row, next) {
            match_row.userid = match_row.u_userid || '';
            match_row.course = match_row.course_id || '';
            match_row.cmid = match_row.cm_id || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cmid);

            match_row.info_user_id = match_row.info_user_id || '';
            match_row.info_user_firstname = match_row.info_user_firstname || '';
            match_row.info_user_lastname = match_row.info_user_lastname || '';

            var re_id = new RegExp(/id=\d+/);
            var with_id = 'id=' + match_row.info_user_id;
            var updated_info_first = old_row.info.replace(re_id, with_id);

            var fullname = match_row.info_user_firstname + ' ' + match_row.info_user_lastname;
            var re_fn = new RegExp(/fullname=[^)]+/);
            var with_fn = 'fullname=' + fullname;

            var updated_info = updated_info_first.replace(re_fn, with_fn);

            let info = `?`;
            info = dbs.mysql_to_postgres(mysql.format(info, [updated_info]));
            var output = 'INSERT INTO mdl_log ' +
                '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                '(' +
                [
                    old_row.time,
                    match_row.userid,
                    "'" + old_row.ip + "'",
                    match_row.course,
                    "'" + old_row.module + "'",
                    match_row.cmid,
                    "'" + old_row.action + "'",
                    "'" + updated_url + "'",
                    info
                ].join(',') +
                ')';
            next && next(null, output);
        }
    },

    "revert submission to draft": {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'revert submission to draft' LIMIT 1;
         +---------+------------+--------+--------------+--------+--------+-------+----------------------------+-------------------+-------------------------------------------------------------------------------------+
         | id      | time       | userid | ip           | course | module | cmid  | action                     | url               | info                                                                                |
         +---------+------------+--------+--------------+--------+--------+-------+----------------------------+-------------------+-------------------------------------------------------------------------------------+
         | 1004921 | 1364894804 |    943 | 37.14.118.25 |    153 | assign | 10405 | revert submission to draft | view.php?id=10405 | Revert submission to draft for student: (id=402, fullname=MARIA CRUZ GARCIA PEREZ). |
         +---------+------------+--------+--------------+--------+--------+-------+----------------------------+-------------------+-------------------------------------------------------------------------------------+

         userid  => mdl_user.id
         course  => mdl_course.id
         module  => mdl_module.name
         cmid    => mdl_course_modules.id
         url: id => cmid
         info: id => mdl_user.id, fullname => fullname(id)

         mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'revert submission to draft';
         +----------+
         | count(*) |
         +----------+
         |       13 |
         +----------+
         */

        sql_old:
            'SELECT log.*, ' +
            'u.username AS u_username, u.email AS u_email, ' +
            'c.shortname AS course_shortname, ' +
            'a.name AS assign_name ' +
            'FROM mdl_log log ' +
            'LEFT JOIN mdl_course c ON log.course = c.id ' +
            'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
            'LEFT JOIN mdl_assign a ON cm.instance = a.id ' +
            'JOIN mdl_user u ON log.userid = u.id ' +
            "WHERE log.module = 'assign' " +
            "AND log.action = 'revert submission to draft' " +
            "AND " + restrict_clause,

        sql_old_2pass: (row) => {
            let id = row.info.match(/id=(\d+)/); // Get user ID of info_user.
            if (!id && row.info.match(/id=/)) {
                id = [null, row.info];
            }
            return mysql.format(
                'SELECT u.id AS info_user_id, ' +
                '       u.email AS info_user_email, ' +
                '       u.username AS info_user_username, ' +
                '       u.firstname AS info_user_firstname, ' +
                '       u.lastname AS info_user_lastname ' +
                'FROM mdl_user u ' +
                'WHERE id = ?',
                [
                    id[1]
                ]
            );
        },

        sql_match: (row) => {
            return row.assign_name ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'c.id AS course_id , ' +
                    'a.id AS a_id, a.name AS a_name, ' +
                    'u.id AS u_userid, u.username AS u_username, u.email AS u_email, ' +
                    'info_user.id AS info_user_id, info_user.username AS info_user_username, info_user.email AS info_user_email, ' +
                    'info_user.firstname AS info_user_firstname, info_user.lastname AS info_user_lastname ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_assign a ON a.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'JOIN mdl_user info_user ON (BINARY info_user.email = ? OR info_user.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND a.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        row["info_user_email"],
                        row["info_user_username"],
                        'assign',
                        row["course_shortname"],
                        row["assign_name"]
                    ]
                )
                :
                null;
        },

        fixer: function (log_row, old_matches, new_matches) {
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                var match_1 = (lr.u_username === nm.u_username || lr.u_email === nm.u_email);
                var match_2 = (lr.info_user_username === nm.info_user_username || lr.info_user_email === nm.info_user_email);
                return (match_1 && match_2);
            });
        },

        fn: function (old_row, match_row, next) {
            match_row.userid = match_row.u_userid || '';
            match_row.course = match_row.course_id || '';
            match_row.cmid = match_row.cm_id || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cmid);

            match_row.info_user_id = match_row.info_user_id || '';
            match_row.info_user_firstname = match_row.info_user_firstname || '';
            match_row.info_user_lastname = match_row.info_user_lastname || '';

            var re_id = new RegExp(/id=\d+/);
            var with_id = 'id=' + match_row.info_user_id;
            var updated_info_first = old_row.info.replace(re_id, with_id);

            var fullname = match_row.info_user_firstname + ' ' + match_row.info_user_lastname;
            var re_fn = new RegExp(/fullname=[^)]+/);
            var with_fn = 'fullname=' + fullname;

            var updated_info = updated_info_first.replace(re_fn, with_fn);

            let info = `?`;
            info = dbs.mysql_to_postgres(mysql.format(info, [updated_info]));
            var output = 'INSERT INTO mdl_log ' +
                '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                '(' +
                [
                    old_row.time,
                    match_row.userid,
                    "'" + old_row.ip + "'",
                    match_row.course,
                    "'" + old_row.module + "'",
                    match_row.cmid,
                    "'" + old_row.action + "'",
                    "'" + updated_url + "'",
                    info
                ].join(',') +
                ')';
            next && next(null, output);
        }
    },

    "submit": {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'submit' LIMIT 1;
         +--------+------------+--------+--------------+--------+--------+------+--------+------------------+-----------------------------------------------------------------------------------------------+
         | id     | time       | userid | ip           | course | module | cmid | action | url              | info                                                                                          |
         +--------+------------+--------+--------------+--------+--------+------+--------+------------------+-----------------------------------------------------------------------------------------------+
         | 947431 | 1362313949 |   1296 | 92.253.44.22 |    103 | assign | 9757 | submit | view.php?id=9757 | Submission status: Draft (not submitted). <br><br> the number of file(s) : 2 file(s).<br><br> |
         +--------+------------+--------+--------------+--------+--------+------+--------+------------------+-----------------------------------------------------------------------------------------------+

         userid  => mdl_user.id
         course  => mdl_course.id
         module  => mdl_module.name
         cmid    => mdl_course_modules.id
         url: id => cmid
         info: <HTML>

         mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'submit';
         +----------+
         | count(*) |
         +----------+
         |     3308 |
         +----------+
         */

        sql_old:
            'SELECT log.*, ' +
            'u.username AS u_username, u.email AS u_email, ' +
            'c.shortname AS course_shortname, ' +
            'a.name AS assign_name ' +
            'FROM mdl_log log ' +
            'LEFT JOIN mdl_course c ON log.course = c.id ' +
            'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
            'LEFT JOIN mdl_assign a ON cm.instance = a.id ' +
            'JOIN mdl_user u ON log.userid = u.id ' +
            "WHERE log.module = 'assign' " +
            "AND log.action = 'submit' " +
            "AND " + restrict_clause,

        sql_match: (row) => {
            return row.assign_name ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'c.id AS course_id , ' +
                    'a.id AS a_id, a.name AS a_name, ' +
                    'u.id AS u_userid, u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_assign a ON a.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND a.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'assign',
                        row["course_shortname"],
                        row["assign_name"],
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
            match_row.userid = match_row.u_userid || '';
            match_row.course = match_row.course_id || '';
            match_row.cmid = match_row.cm_id || '';
            match_row.a_id = match_row.a_id || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cmid);
            var output = 'INSERT INTO mdl_log ' +
                '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                '(' +
                [
                    old_row.time,
                    match_row.userid,
                    "'" + old_row.ip + "'",
                    match_row.course,
                    "'" + old_row.module + "'",
                    match_row.cmid,
                    "'" + old_row.action + "'",
                    "'" + updated_url + "'",
                    "'" + match_row.a_id + "'"
                ].join(',') +
                ')';
            next && next(null, output);
        }
    },

    "submit for grading": {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'submit for grading' LIMIT 1;
         +--------+------------+--------+--------------+--------+--------+------+--------------------+------------------+-----------------------------------------------------------------------------------------------+
         | id     | time       | userid | ip           | course | module | cmid | action             | url              | info                                                                                          |
         +--------+------------+--------+--------------+--------+--------+------+--------------------+------------------+-----------------------------------------------------------------------------------------------+
         | 947436 | 1362314020 |   1296 | 92.253.44.22 |    103 | assign | 9757 | submit for grading | view.php?id=9757 | Submission status: Submitted for grading. <br><br> the number of file(s) : 2 file(s).<br><br> |
         +--------+------------+--------+--------------+--------+--------+------+--------------------+------------------+-----------------------------------------------------------------------------------------------+

         userid  => mdl_user.id
         course  => mdl_course.id
         module  => mdl_module.name
         cmid    => mdl_course_modules.id
         url: id => cmid
         info: <HTML>

         mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'submit for grading';
         +----------+
         | count(*) |
         +----------+
         |     1193 |
         +----------+
         */
        sql_old:
            'SELECT log.*, ' +
            'u.username AS u_username, u.email AS u_email, ' +
            'c.shortname AS course_shortname, ' +
            'a.name AS assign_name ' +
            'FROM mdl_log log ' +
            'LEFT JOIN mdl_course c ON log.course = c.id ' +
            'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
            'LEFT JOIN mdl_assign a ON cm.instance = a.id ' +
            'JOIN mdl_user u ON log.userid = u.id ' +
            "WHERE log.module = 'assign' " +
            "AND log.action = 'submit for grading' " +
            "AND " + restrict_clause,

        sql_match: (row) => {
            return row.assign_name ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'c.id AS course_id , ' +
                    'a.id AS a_id, a.name AS a_name, ' +
                    'u.id AS u_userid, u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_assign a ON a.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND a.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'assign',
                        row["course_shortname"],
                        row["assign_name"],
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
            match_row.userid = match_row.u_userid || '';
            match_row.course = match_row.course_id || '';
            match_row.cmid = match_row.cm_id || '';
            match_row.a_id = match_row.a_id || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cmid);
            var output = 'INSERT INTO mdl_log ' +
                '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                '(' +
                [
                    old_row.time,
                    match_row.userid,
                    "'" + old_row.ip + "'",
                    match_row.course,
                    "'" + old_row.module + "'",
                    match_row.cmid,
                    "'" + old_row.action + "'",
                    "'" + updated_url + "'",
                    "'" + match_row.a_id + "'"
                ].join(',') +
                ')';
            next && next(null, output);
        }
    },

    "unlock submission": {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'unlock submission' LIMIT 1;
         +---------+------------+--------+---------------+--------+--------+------+-------------------+------------------+--------------------------------------------------------------------+
         | id      | time       | userid | ip            | course | module | cmid | action            | url              | info                                                               |
         +---------+------------+--------+---------------+--------+--------+------+-------------------+------------------+--------------------------------------------------------------------+
         | 1011149 | 1365405110 |   1667 | 212.163.190.6 |     97 | assign | 9606 | unlock submission | view.php?id=9606 | Allow submissions for student: (id=1438, fullname=Niyongabo Come). |
         +---------+------------+--------+---------------+--------+--------+------+-------------------+------------------+--------------------------------------------------------------------+

         userid  => mdl_user.id
         course  => mdl_course.id
         module  => mdl_module.name
         cmid    => mdl_course_modules.id
         url: id => cmid
         info: id => mdl_user.id, fullname => fullname(id)

         mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'unlock submission';
         +----------+
         | count(*) |
         +----------+
         |       58 |
         +----------+
         */
        sql_old:
            'SELECT log.*, ' +
            'u.username AS u_username, u.email AS u_email, ' +
            'c.shortname AS course_shortname, ' +
            'a.name AS assign_name ' +
            'FROM mdl_log log ' +
            'LEFT JOIN mdl_course c ON log.course = c.id ' +
            'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
            'LEFT JOIN mdl_assign a ON cm.instance = a.id ' +
            'JOIN mdl_user u ON log.userid = u.id ' +
            "WHERE log.module = 'assign' " +
            "AND log.action = 'unlock submission' " +
            "AND " + restrict_clause,

        sql_old_2pass: (row) => {
            let id = row.info.match(/id=(\d+)/); // Get user ID of info_user.
            if (!id && row.info.match(/id=/)) {
                id = [null, row.info];
            }
            return mysql.format(
                'SELECT u.id AS info_user_id, ' +
                '       u.email AS info_user_email, ' +
                '       u.username AS info_user_username, ' +
                '       u.firstname AS info_user_firstname, ' +
                '       u.lastname AS info_user_lastname ' +
                'FROM mdl_user u ' +
                'WHERE id = ?',
                [
                    id[1]
                ]
            );
        },

        sql_match: (row) => {
            return row.assign_name ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'c.id AS course_id , ' +
                    'a.id AS a_id, a.name AS a_name, ' +
                    'u.id AS u_userid, u.username AS u_username, u.email AS u_email, ' +
                    'info_user.id AS info_user_id, info_user.username AS info_user_username, info_user.email AS info_user_email, ' +
                    'info_user.firstname AS info_user_firstname, info_user.lastname AS info_user_lastname ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_assign a ON a.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'JOIN mdl_user info_user ON (BINARY info_user.email = ? OR info_user.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND a.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        row["info_user_email"],
                        row["info_user_username"],
                        'assign',
                        row["course_shortname"],
                        row["assign_name"]
                    ]
                )
                :
                null;
        },

        fixer: function (log_row, old_matches, new_matches) {
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                var match_1 = (lr.u_username === nm.u_username || lr.u_email === nm.u_email);
                var match_2 = (lr.info_user_username === nm.info_user_username || lr.info_user_email === nm.info_user_email);
                return (match_1 && match_2);
            });
        },

        fn: function (old_row, match_row, next) {
            match_row.userid = match_row.u_userid || '';
            match_row.course = match_row.course_id || '';
            match_row.cmid = match_row.cm_id || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cmid);

            match_row.info_user_id = match_row.info_user_id || '';
            match_row.info_user_firstname = match_row.info_user_firstname || '';
            match_row.info_user_lastname = match_row.info_user_lastname || '';

            var re_id = new RegExp(/id=\d+/);
            var with_id = 'id=' + match_row.info_user_id;
            var updated_info_first = old_row.info.replace(re_id, with_id);

            var fullname = match_row.info_user_firstname + ' ' + match_row.info_user_lastname;
            var re_fn = new RegExp(/fullname=[^)]+/);
            var with_fn = 'fullname=' + fullname;

            var updated_info = updated_info_first.replace(re_fn, with_fn);

            let info = `?`;
            info = dbs.mysql_to_postgres(mysql.format(info, [updated_info]));
            var output = 'INSERT INTO mdl_log ' +
                '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                '(' +
                [
                    old_row.time,
                    match_row.userid,
                    "'" + old_row.ip + "'",
                    match_row.course,
                    "'" + old_row.module + "'",
                    match_row.cmid,
                    "'" + old_row.action + "'",
                    "'" + updated_url + "'",
                    info
                ].join(',') +
                ')';
            next && next(null, output);
        }
    },

    "update": undefined, /*{

     mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'update' LIMIT 1;
     +-------+------------+--------+---------------+--------+--------+------+--------+-----------------+------+
     | id    | time       | userid | ip            | course | module | cmid | action | url             | info |
     +-------+------------+--------+---------------+--------+--------+------+--------+-----------------+------+
     | 19500 | 1246461641 |     48 | 212.163.190.6 |     18 | assign | 8447 | update | view.php?id=312 | 76   |
     +-------+------------+--------+---------------+--------+--------+------+--------+-----------------+------+

     userid  => mdl_user.id
     course  => mdl_course.id
     module  => mdl_module.name
     cmid    => mdl_course_modules.id
     url: id => mdl_course_modules.id -> it does not match
     info: id => mdl_assign.id -> it does not match

     mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'update';
     +----------+
     | count(*) |
     +----------+
     |     5665 |
     +----------+

     We can not create bulletproof data to do sync.
     },*/

    "update grades": undefined, /*{

     mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'update grades' LIMIT 1;
     +-------+------------+--------+----------------+--------+--------+------+---------------+-----------------------+------+
     | id    | time       | userid | ip             | course | module | cmid | action        | url                   | info |
     +-------+------------+--------+----------------+--------+--------+------+---------------+-----------------------+------+
     | 24306 | 1248099280 |     48 | 77.210.169.142 |     18 | assign | 8451 | update grades | submissions.php?id=77 | 7    |
     +-------+------------+--------+----------------+--------+--------+------+---------------+-----------------------+------+

     userid  => mdl_user.id
     course  => mdl_course.id
     module  => mdl_module.name
     cmid    => mdl_course_modules.id
     url: id => ? mod/assign does not have submissions.php
     info: id => mdl_assign.id -> it does not match

     mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'update grades';
     +----------+
     | count(*) |
     +----------+
     |     3319 |
     +----------+

     We can not create bulletproof data to do sync.
     },*/

    "upload": undefined, /*{

     mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'upload' LIMIT 1;
     +-------+------------+--------+---------------+--------+--------+------+--------+---------------+------+
     | id    | time       | userid | ip            | course | module | cmid | action | url           | info |
     +-------+------------+--------+---------------+--------+--------+------+--------+---------------+------+
     | 22886 | 1247557848 |     20 | 212.163.190.6 |     18 | assign | 8451 | upload | view.php?a=80 | 80   |
     +-------+------------+--------+---------------+--------+--------+------+--------+---------------+------+

     userid  => mdl_user.id
     course  => mdl_course.id
     module  => mdl_module.name
     cmid    => mdl_course_modules.id
     url: a => mdl_assign.id -> it does not match
     info: id => mdl_assign.id -> it does not match

     mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'upload';
     +----------+
     | count(*) |
     +----------+
     |     3968 |
     +----------+

     We can not create bulletproof data to do sync.
     },*/

    "view": undefined, /*{

     mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'view' LIMIT 1;
     +-------+------------+--------+---------------+--------+--------+------+--------+-----------------+------+
     | id    | time       | userid | ip            | course | module | cmid | action | url             | info |
     +-------+------------+--------+---------------+--------+--------+------+--------+-----------------+------+
     | 19502 | 1246461647 |     48 | 212.163.190.6 |     18 | assign | 8447 | view   | view.php?id=312 | 76   |
     +-------+------------+--------+---------------+--------+--------+------+--------+-----------------+------+

     userid  => mdl_user.id
     course  => mdl_course.id
     module  => mdl_module.name
     cmid    => mdl_course_modules.id
     url: id => mdl_course_modules.id -> it does not match
     info: id => mdl_assign.id -> it does not match

     mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'view';
     +----------+
     | count(*) |
     +----------+
     |   133184 |
     +----------+

     We can not create bulletproof data to do sync.
     },*/

    "view all": {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'view all' LIMIT 1;
         +--------+------------+--------+----------------+--------+--------+------+----------+-----------------+------+
         | id     | time       | userid | ip             | course | module | cmid | action   | url             | info |
         +--------+------------+--------+----------------+--------+--------+------+----------+-----------------+------+
         | 948806 | 1362406941 |   1573 | 41.190.228.166 |     97 | assign |    0 | view all | index.php?id=97 |      |
         +--------+------------+--------+----------------+--------+--------+------+----------+-----------------+------+

         userid  => mdl_user.id
         course  => mdl_course.id
         module  => mdl_module.name
         // cmid    => 0
         url: id => course
         // info: ''

         mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'view all';
         +----------+
         | count(*) |
         +----------+
         |     1410 |
         +----------+
         */
        sql_old:
            'SELECT log.*, ' +
            'u.username AS u_username, u.email AS u_email, ' +
            'c.shortname AS course_shortname ' +
            'FROM mdl_log log ' +
            'LEFT JOIN mdl_course c ON log.course = c.id ' +
            'JOIN mdl_user u ON log.userid = u.id ' +
            "WHERE log.module = 'assign' " +
            "AND log.action = 'view all' " +
            "AND " + restrict_clause,

        sql_match: (row) => {
            return row.course_shortname ?
                mysql.format(
                    'SELECT c.id AS course_id, ' +
                    'u.id AS u_userid, u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_course c ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'WHERE c.shortname = ?',
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
            match_row.userid = match_row.u_userid || '';
            match_row.course = match_row.course_id || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.course);
            var updated_info = old_row.info;
            let info = `?`;
            info = dbs.mysql_to_postgres(mysql.format(info, [updated_info]));
            var output = 'INSERT INTO mdl_log ' +
                '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                '(' +
                [
                    old_row.time,
                    match_row.userid,
                    "'" + old_row.ip + "'",
                    match_row.course,
                    "'" + old_row.module + "'",
                    "'" + old_row.cmid + "'",
                    "'" + old_row.action + "'",
                    "'" + updated_url + "'",
                    info
                ].join(',') +
                ')';
            next && next(null, output);
        }
    },

    "view feedback": {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'view feedback' LIMIT 1;
         +--------+------------+--------+---------------+--------+--------+------+---------------+------------------+------------------------------+
         | id     | time       | userid | ip            | course | module | cmid | action        | url              | info                         |
         +--------+------------+--------+---------------+--------+--------+------+---------------+------------------+------------------------------+
         | 960782 | 1363187879 |    724 | 212.163.190.6 |     77 | assign | 9366 | view feedback | view.php?id=9366 | View feedback for user: 1090 |
         +--------+------------+--------+---------------+--------+--------+------+---------------+------------------+------------------------------+

         userid  => mdl_user.id
         course  => mdl_course.id
         module  => mdl_module.name
         cmid    => mdl_course_modules.id
         url: id => cmid
         info: id => mdl_user.id

         mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'view feedback';
         +----------+
         | count(*) |
         +----------+
         |      599 |
         +----------+
         */
        sql_old:
            'SELECT log.*, ' +
            'u.username AS u_username, u.email AS u_email, ' +
            'c.shortname AS course_shortname, ' +
            'a.name AS assign_name ' +
            'FROM mdl_log log ' +
            'LEFT JOIN mdl_course c ON log.course = c.id ' +
            'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
            'LEFT JOIN mdl_assign a ON cm.instance = a.id ' +
            'JOIN mdl_user u ON log.userid = u.id ' +
            "WHERE log.module = 'assign' " +
            "AND log.action = 'view feedback' " +
            "AND " + restrict_clause,

        sql_old_2pass: (row) => {
            let id = row.info.match(/[\d]+/); // Get user ID of info_user.
            if (!id) {
                id = [null, row.info];
            }
            return mysql.format(
                'SELECT u.id AS info_user_id, ' +
                '       u.email AS info_user_email, ' +
                '       u.username AS info_user_username, ' +
                '       u.firstname AS info_user_firstname, ' +
                '       u.lastname AS info_user_lastname ' +
                'FROM mdl_user u ' +
                'WHERE id = ?',
                [
                    id[0]
                ]
            );
        },

        sql_match: (row) => {
            return row.assign_name ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'c.id AS course_id , ' +
                    'a.id AS a_id, a.name AS a_name, ' +
                    'u.id AS u_userid, u.username AS u_username, u.email AS u_email, ' +
                    'info_user.id AS info_user_id, info_user.username AS info_user_username, info_user.email AS info_user_email, ' +
                    'info_user.firstname AS info_user_firstname, info_user.lastname AS info_user_lastname ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_assign a ON a.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'JOIN mdl_user info_user ON (BINARY info_user.email = ? OR info_user.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND a.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        row["info_user_email"],
                        row["info_user_username"],
                        'assign',
                        row["course_shortname"],
                        row["assign_name"]
                    ]
                )
                :
                null;
        },

        fixer: function (log_row, old_matches, new_matches) {
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                var match_1 = (lr.u_username === nm.u_username || lr.u_email === nm.u_email);
                var match_2 = (lr.info_user_username === nm.info_user_username || lr.info_user_email === nm.info_user_email);
                return (match_1 && match_2);
            });
        },

        fn: function (old_row, match_row, next) {
            match_row.userid = match_row.u_userid || '';
            match_row.course = match_row.course_id || '';
            match_row.cmid = match_row.cm_id || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cmid);

            match_row.info_user_id = match_row.info_user_id || '';
            match_row.info_user_firstname = match_row.info_user_firstname || '';
            match_row.info_user_lastname = match_row.info_user_lastname || '';

            var re_id = new RegExp(/\d+/);
            var with_id = match_row.info_user_id;
            var updated_info = old_row.info.replace(re_id, with_id);

            let info = `?`;
            info = dbs.mysql_to_postgres(mysql.format(info, [updated_info]));
            var output = 'INSERT INTO mdl_log ' +
                '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                '(' +
                [
                    old_row.time,
                    match_row.userid,
                    "'" + old_row.ip + "'",
                    match_row.course,
                    "'" + old_row.module + "'",
                    match_row.cmid,
                    "'" + old_row.action + "'",
                    "'" + updated_url + "'",
                    info
                ].join(',') +
                ')';
            next && next(null, output);
        }
    },

    "view grading form": {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'view grading form' LIMIT 1;
         +--------+------------+--------+---------------+--------+--------+------+-------------------+------------------+---------------------------------------------------------------+
         | id     | time       | userid | ip            | course | module | cmid | action            | url              | info                                                          |
         +--------+------------+--------+---------------+--------+--------+------+-------------------+------------------+---------------------------------------------------------------+
         | 953624 | 1362659594 |   1297 | 212.163.190.6 |     97 | assign | 9573 | view grading form | view.php?id=9573 | View grading page for student: (id=73, fullname=Luz Linares). |
         +--------+------------+--------+---------------+--------+--------+------+-------------------+------------------+---------------------------------------------------------------+

         userid  => mdl_user.id
         course  => mdl_course.id
         module  => mdl_module.name
         cmid    => mdl_course_modules.id
         url: id => cmid
         info: id => mdl_user.id, fullname => fullname(id)

         mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'view grading form';
         +----------+
         | count(*) |
         +----------+
         |     3972 |
         +----------+
         */
        sql_old:
            'SELECT log.*, ' +
            'u.username AS u_username, u.email AS u_email, ' +
            'c.shortname AS course_shortname, ' +
            'a.name AS assign_name ' +
            'FROM mdl_log log ' +
            'LEFT JOIN mdl_course c ON log.course = c.id ' +
            'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
            'LEFT JOIN mdl_assign a ON cm.instance = a.id ' +
            'JOIN mdl_user u ON log.userid = u.id ' +
            "WHERE log.module = 'assign' " +
            "AND log.action = 'view grading form' " +
            "AND " + restrict_clause,

        sql_old_2pass: (row) => {
            let id = row.info.match(/id=(\d+)/); // Get user ID of info_user.
            if (!id && row.info.match(/id=/)) {
                id = [null, row.info];
            }
            return mysql.format(
                'SELECT u.id AS info_user_id, ' +
                '       u.email AS info_user_email, ' +
                '       u.username AS info_user_username, ' +
                '       u.firstname AS info_user_firstname, ' +
                '       u.lastname AS info_user_lastname ' +
                'FROM mdl_user u ' +
                'WHERE id = ?',
                [
                    id[1]
                ]
            );
        },

        sql_match: (row) => {
            return row.assign_name ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'c.id AS course_id , ' +
                    'a.id AS a_id, a.name AS a_name, ' +
                    'u.id AS u_userid, u.username AS u_username, u.email AS u_email, ' +
                    'info_user.id AS info_user_id, info_user.username AS info_user_username, info_user.email AS info_user_email, ' +
                    'info_user.firstname AS info_user_firstname, info_user.lastname AS info_user_lastname ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_assign a ON a.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'JOIN mdl_user info_user ON (BINARY info_user.email = ? OR info_user.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND a.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        row["info_user_email"],
                        row["info_user_username"],
                        'assign',
                        row["course_shortname"],
                        row["assign_name"]
                    ]
                )
                :
                null;
        },

        fixer: function (log_row, old_matches, new_matches) {
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                var match_1 = (lr.u_username === nm.u_username || lr.u_email === nm.u_email);
                var match_2 = (lr.info_user_username === nm.info_user_username || lr.info_user_email === nm.info_user_email);
                return (match_1 && match_2);
            });
        },

        fn: function (old_row, match_row, next) {
            match_row.userid = match_row.u_userid || '';
            match_row.course = match_row.course_id || '';
            match_row.cmid = match_row.cm_id || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cmid);

            match_row.info_user_id = match_row.info_user_id || '';
            match_row.info_user_firstname = match_row.info_user_firstname || '';
            match_row.info_user_lastname = match_row.info_user_lastname || '';

            var re_id = new RegExp(/id=\d+/);
            var with_id = 'id=' + match_row.info_user_id;
            var updated_info_first = old_row.info.replace(re_id, with_id);

            var fullname = match_row.info_user_firstname + ' ' + match_row.info_user_lastname;
            var re_fn = new RegExp(/fullname=[^)]+/);
            var with_fn = 'fullname=' + fullname;

            var updated_info = updated_info_first.replace(re_fn, with_fn);

            let info = `?`;
            info = dbs.mysql_to_postgres(mysql.format(info, [updated_info]));
            var output = 'INSERT INTO mdl_log ' +
                '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                '(' +
                [
                    old_row.time,
                    match_row.userid,
                    "'" + old_row.ip + "'",
                    match_row.course,
                    "'" + old_row.module + "'",
                    match_row.cmid,
                    "'" + old_row.action + "'",
                    "'" + updated_url + "'",
                    info
                ].join(',') +
                ')';
            next && next(null, output);
        }
    },

    "view submission": undefined, /*{

     mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'view submission' LIMIT 1;
     +-------+------------+--------+---------------+--------+--------+------+-----------------+-----------------------+------+
     | id    | time       | userid | ip            | course | module | cmid | action          | url                   | info |
     +-------+------------+--------+---------------+--------+--------+------+-----------------+-----------------------+------+
     | 19537 | 1246463282 |     48 | 212.163.190.6 |     18 | assign | 8447 | view submission | submissions.php?id=76 | 76   |
     +-------+------------+--------+---------------+--------+--------+------+-----------------+-----------------------+------+

     userid  => mdl_user.id
     course  => mdl_course.id
     module  => mdl_module.name
     cmid    => mdl_course_modules.id
     url: id => ? mod/assign does not have submissions.php
     info: id => mdl_assign.id -> it does not match

     mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'view submission';
     +----------+
     | count(*) |
     +----------+
     |     8023 |
     +----------+

     We can not create bulletproof data to do sync.
     },*/

    "view submission grading table": {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'view submission grading table' LIMIT 1;
         +--------+------------+--------+-----------------+--------+--------+------+-------------------------------+------------------+---------------------------------------------+
         | id     | time       | userid | ip              | course | module | cmid | action                        | url              | info                                        |
         +--------+------------+--------+-----------------+--------+--------+------+-------------------------------+------------------+---------------------------------------------+
         | 942019 | 1362074220 |   1578 | 217.124.190.226 |     97 | assign | 9572 | view submission grading table | view.php?id=9572 | Ver tabla de calificaciones de las entregas |
         +--------+------------+--------+-----------------+--------+--------+------+-------------------------------+------------------+---------------------------------------------+

         userid  => mdl_user.id
         course  => mdl_course.id
         module  => mdl_module.name
         cmid    => mdl_course_modules.id
         url: id => cmid
         // info: id =>

         mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'view submission grading table';
         +----------+
         | count(*) |
         +----------+
         |     9930 |
         +----------+
         */
        sql_old:
            'SELECT log.*, ' +
            'u.username AS u_username, u.email AS u_email, ' +
            'c.shortname AS course_shortname, ' +
            'a.name AS assign_name ' +
            'FROM mdl_log log ' +
            'LEFT JOIN mdl_course c ON log.course = c.id ' +
            'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
            'LEFT JOIN mdl_assign a ON cm.instance = a.id ' +
            'JOIN mdl_user u ON log.userid = u.id ' +
            "WHERE log.module = 'assign' " +
            "AND log.action = 'view submission grading table' " +
            "AND " + restrict_clause,

        sql_match: (row) => {
            return row.assign_name ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'c.id AS course_id , ' +
                    'a.id AS a_id, a.name AS a_name, ' +
                    'u.id AS u_userid, u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_assign a ON a.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND a.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'assign',
                        row["course_shortname"],
                        row["assign_name"],
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
            match_row.userid = match_row.u_userid || '';
            match_row.course = match_row.course_id || '';
            match_row.cmid = match_row.cm_id || '';
            match_row.a_id = match_row.a_id || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cmid);
            var output = 'INSERT INTO mdl_log ' +
                '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                '(' +
                [
                    old_row.time,
                    match_row.userid,
                    "'" + old_row.ip + "'",
                    match_row.course,
                    "'" + old_row.module + "'",
                    match_row.cmid,
                    "'" + old_row.action + "'",
                    "'" + updated_url + "'",
                    "'" + match_row.a_id + "'"
                ].join(',') +
                ')';
            next && next(null, output);
        }
    },

    "view submit assignment form": {
        /*
         mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'view submit assignment form' LIMIT 1;
         +--------+------------+--------+--------------+--------+--------+------+-----------------------------+------------------+----------------------------------+
         | id     | time       | userid | ip           | course | module | cmid | action                      | url              | info                             |
         +--------+------------+--------+--------------+--------+--------+------+-----------------------------+------------------+----------------------------------+
         | 947430 | 1362313318 |   1296 | 92.253.44.22 |    103 | assign | 9757 | view submit assignment form | view.php?id=9757 | View own submit assignment page. |
         +--------+------------+--------+--------------+--------+--------+------+-----------------------------+------------------+----------------------------------+

         userid  => mdl_user.id
         course  => mdl_course.id
         module  => mdl_module.name
         cmid    => mdl_course_modules.id
         url: id => cmid
         // info: id =>

         mysql> SELECT count(*) FROM mdl_log WHERE module='assign' AND action = 'view submit assignment form';
         +----------+
         | count(*) |
         +----------+
         |     4975 |
         +----------+
         */
        sql_old:
            'SELECT log.*, ' +
            'u.username AS u_username, u.email AS u_email, ' +
            'c.shortname AS course_shortname ' +
            'FROM mdl_log log ' +
            'LEFT JOIN mdl_course c ON log.course = c.id ' +
            'JOIN mdl_user u ON log.userid = u.id ' +
            "WHERE log.module = 'assign' " +
            "AND log.action = 'view submit assignment form' " +
            "AND " + restrict_clause,

        sql_match: (row) => {
            return row.course_shortname ?
                mysql.format(
                    'SELECT c.id AS course_id, ' +
                    'u.id AS u_userid, u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_course c ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'WHERE c.shortname = ?',
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
            match_row.userid = match_row.u_userid || '';
            match_row.course = match_row.course_id || '';

            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.course);
            var updated_info = old_row.info;

            let info = `?`;
            info = dbs.mysql_to_postgres(mysql.format(info, [updated_info]));
            var output = 'INSERT INTO mdl_log ' +
                '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                '(' +
                [
                    old_row.time,
                    match_row.userid,
                    "'" + old_row.ip + "'",
                    match_row.course,
                    "'" + old_row.module + "'",
                    "'" + old_row.cmid + "'",
                    "'" + old_row.action + "'",
                    "'" + updated_url + "'",
                    info
                ].join(',') +
                ')';
            next && next(null, output);
        }
    },
};

module.exports = library;
