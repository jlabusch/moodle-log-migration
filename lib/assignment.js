var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    bogus_email = require('./common.js').bogus_email,
    fix_by_shadow_index = require('./common.js').fix_by_shadow_index,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

/*
mysql> select action,count(*) from mdl_log where module='assignment' group by action;
+-----------------+----------+
| action          | count(*) |
+-----------------+----------+
| add             |       27 |
| update          |       65 |
| update grades   |        3 |
| upload          |      240 |
| view            |     2399 |
| view all        |     8966 |
| view submission |      159 |
+-----------------+----------+

Unfortunately, the mdl_assignment table is pretty much empty.

mysql> select id,course,name from mdl_assignment;
+----+--------+----------------------------------+
| id | course | name                             |
+----+--------+----------------------------------+
|  1 |    192 | Logistix 7 Installation          |
|  2 |    192 | Logistix 7 Navigation            |
|  3 |    192 | Logistix 7 Configuration         |
|  4 |    192 | Creating Documents OUT (PCM)     |
|  5 |    192 | Making Receptions                |
|  6 |    192 | Stock management                 |
|  7 |    192 | Declaring a Request              |
|  8 |    192 | Routing                          |
|  9 |    192 | Declaring a Reception            |
| 10 |    192 | Packing List & Freight Manifests |
| 11 |    192 | Make a Backup                    |
| 12 |    192 | Restore a Data File              |
| 13 |    192 | Update with ITC starting Data    |
| 14 |    192 | Final task                       |
+----+--------+----------------------------------+

Since mdl_assignment is only really pre-2.3, let's ignore it.

Also, cmid for action="view" never matches up to any existing mdl_course_modules.id
*/

var library = {
    "add":{
        /*
        mysql> SELECT * FROM mdl_log WHERE module='assignment' AND action = 'add' ORDER BY id DESC LIMIT 1;
        +--------+------------+--------+---------------+--------+------------+------+--------+------------------+------+
        | id     | time       | userid | ip            | course | module     | cmid | action | url              | info |
        +--------+------------+--------+---------------+--------+------------+------+--------+------------------+------+
        | 895212 | 1358156321 |      2 | 212.163.190.6 |    106 | assignment | 8390 | add    | view.php?id=8390 | 1833 |
        +--------+------------+--------+---------------+--------+------------+------+--------+------------------+------+

        userid  => mdl_user.id
        course  => mdl_course.id
        module  => mdl_module.name
        cmid    => mdl_course_modules.id
        url: id => cmid
        info    => mdl_assignment.id

        mysql> SELECT count(*) FROM mdl_log WHERE module='assignment' AND action = 'add';
        +----------+
        | count(*) |
        +----------+
        |       27 |
        +----------+
        */

        sql_old:
            'SELECT log.*, ' +
                'u.username AS u_username, u.email AS u_email, ' +
                'c.shortname AS course_shortname, ' +
                'a.name AS assignment_name ' +
                'FROM mdl_log log ' +
                'LEFT JOIN mdl_course c ON log.course = c.id ' +
                'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
                'LEFT JOIN mdl_assignment a ON cm.instance = a.id ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                "WHERE log.module = 'assignment'" +
                "AND log.action = 'add'" +
                "AND " + restrict_clause,

        sql_old_2pass: (row) => {
            var m = row.url.match(/id=(\d+)/);
            if (!m){
                console.log('No course module ID in URL ' + JSON.stringify(row));
                return null;
            }
        },

        sql_match: (row) => {
            return row.cm_id ?
                mysql.format(
                    'SELECT cm.id AS cm_id ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_assignment a ON a.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND a.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'assignment',
                        row["course_shortname"],
                        row["assignment_name"],
                    ]
                )
                :
                console.log('SELECT cm.id AS cm_id ' +
                    'FROM mdl_course_modules cm  ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course  ' +
                    'JOIN mdl_assignment a ON a.id = cm.instance  ' +
                    'JOIN mdl_modules m ON m.id = cm.module  ' +
                    "JOIN mdl_user u ON (BINARY u.email = '" + row["u_email"] + "' OR u.username = '" + row["u_username"] + "')  " +
                    "WHERE m.name = 'assignment' AND c.shortname = '" + row["course_shortname"] + "' AND a.name = '" + row["assignment_name"] + "'",
                    ' \n ',
                    'No course module ID from DB ' + JSON.stringify(row));
                return null;
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.username;
            });
        },

        fn: function(old_row, match_row, next){
            match_row.cm_id = match_row.cm_id || '';
            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cm_id);
            var output ='INSERT INTO mdl_log ' +
                        '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                        '(' +
                            [
                                old_row.time,
                                match_row.userid,
                                "' " + old_row.ip + "'",
                                match_row.course,
                                "' " + old_row.module + "'",
                                match_row.cmid,
                                "' " + old_row.action + "'",
                                "' " + updated_url + "'",
                                "' " + match_row.quiz_id + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },

    "update":undefined,/*{
        mysql> SELECT * FROM mdl_log WHERE module='assignment' AND action = 'update' ORDER BY id DESC LIMIT 1;
        +--------+------------+--------+---------------+--------+------------+------+--------+------------------+------+
        | id     | time       | userid | ip            | course | module     | cmid | action | url              | info |
        +--------+------------+--------+---------------+--------+------------+------+--------+------------------+------+
        | 912496 | 1359025252 |   1075 | 212.163.190.6 |    123 | assignment | 8158 | update | view.php?id=8158 | 1757 |
        +--------+------------+--------+---------------+--------+------------+------+--------+------------------+------+
        },*/

    "update grades":undefined,/*{
        mysql> SELECT * FROM mdl_log WHERE module='assignment' AND action = 'update grades' ORDER BY id DESC LIMIT 1;
        +--------+------------+--------+---------------+--------+------------+------+---------------+----------------------------------+------+
        | id     | time       | userid | ip            | course | module     | cmid | action        | url                              | info |
        +--------+------------+--------+---------------+--------+------------+------+---------------+----------------------------------+------+
        | 872491 | 1356001346 |      2 | 212.163.190.6 |    119 | assignment | 7969 | update grades | submissions.php?id=1738&user=559 | 559  |
        +--------+------------+--------+---------------+--------+------------+------+---------------+----------------------------------+------+
        },*/

    "upload":undefined,/*{
        mysql> SELECT * FROM mdl_log WHERE module='assignment' AND action = 'upload' ORDER BY id DESC LIMIT 1;
        +--------+------------+--------+---------------+--------+------------+------+--------+-----------------+------+
        | id     | time       | userid | ip            | course | module     | cmid | action | url             | info |
        +--------+------------+--------+---------------+--------+------------+------+--------+-----------------+------+
        | 915617 | 1359295015 |   1145 | 94.249.52.196 |    106 | assignment | 8085 | upload | view.php?a=1754 | 1754 |
        +--------+------------+--------+---------------+--------+------------+------+--------+-----------------+------+
        },*/

    "view":undefined,/*{
        mysql> SELECT * FROM mdl_log WHERE module='assignment' AND action = 'view' ORDER BY id DESC LIMIT 1;
        +--------+------------+--------+---------------+--------+------------+------+--------+------------------+------+
        | id     | time       | userid | ip            | course | module     | cmid | action | url              | info |
        +--------+------------+--------+---------------+--------+------------+------+--------+------------------+------+
        | 920680 | 1359734199 |    491 | 212.163.190.6 |    106 | assignment | 8085 | view   | view.php?id=8085 | 1754 |
        +--------+------------+--------+---------------+--------+------------+------+--------+------------------+------+
        },*/

    "view all":undefined,/*{
        mysql> SELECT * FROM mdl_log WHERE module='assignment' AND action = 'view all' ORDER BY id DESC LIMIT 1;
        +--------+------------+--------+-----------------+--------+------------+------+----------+------------------+------+
        | id     | time       | userid | ip              | course | module     | cmid | action   | url              | info |
        +--------+------------+--------+-----------------+--------+------------+------+----------+------------------+------+
        | 986410 | 1361929286 |     73 | 122.176.232.235 |    157 | assignment |    0 | view all | index.php?id=157 |      |
        +--------+------------+--------+-----------------+--------+------------+------+----------+------------------+------+
        },*/

    "view submission":undefined,/*{
        mysql> SELECT * FROM mdl_log WHERE module='assignment' AND action = 'view submission' ORDER BY id DESC LIMIT 1;
        +--------+------------+--------+---------------+--------+------------+------+-----------------+-------------------------+------+
        | id     | time       | userid | ip            | course | module     | cmid | action          | url                     | info |
        +--------+------------+--------+---------------+--------+------------+------+-----------------+-------------------------+------+
        | 920656 | 1359733597 |    491 | 212.163.190.6 |    106 | assignment | 8085 | view submission | submissions.php?id=1754 | 1754 |
        +--------+------------+--------+---------------+--------+------------+------+-----------------+-------------------------+------+
    },*/
};

module.exports = library;
