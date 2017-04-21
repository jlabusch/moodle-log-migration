var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    bogus_email = require('./common.js').bogus_email,
    fix_by_shadow_index = require('./common.js').fix_by_shadow_index,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

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
    "add":{
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
                "WHERE log.module = 'assign'" +
                "AND log.action = 'add'" +
                "AND " + restrict_clause,

        sql_match: (row) => {
            return row.assign_name ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'u.username AS u_username, u.email AS u_email ' +
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

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.u_username === nm.u_username || lr.u_email === nm.u_email);
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

    "download all submissions":undefined,/*{

         mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'download all submissions' LIMIT 1;
        +---------+------------+--------+---------------+--------+--------+-------+--------------------------+-------------------+--------------------------+
        | id      | time       | userid | ip            | course | module | cmid  | action                   | url               | info                     |
        +---------+------------+--------+---------------+--------+--------+-------+--------------------------+-------------------+--------------------------+
        | 1034844 | 1366648823 |   1238 | 212.163.190.6 |     34 | assign | 10992 | download all submissions | view.php?id=10992 | Download all submissions |
        +---------+------------+--------+---------------+--------+--------+-------+--------------------------+-------------------+--------------------------+

    },*/

    "grade submission":undefined,/*{

        mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'grade submission' LIMIT 1;
        +--------+------------+--------+--------------+--------+--------+------+------------------+------------------+----------------------------------------------------------------------------------------------------------------------------------------+
        | id     | time       | userid | ip           | course | module | cmid | action           | url              | info                                                                                                                                   |
        +--------+------------+--------+--------------+--------+--------+------+------------------+------------------+----------------------------------------------------------------------------------------------------------------------------------------+
        | 964448 | 1363480570 |     48 | 88.17.189.23 |     97 | assign | 9574 | grade submission | view.php?id=9574 | Grade student: (id=1300, fullname=Montse Pairo). Grade: <input type="hidden" name="grademodified_0" value="0"/>9.00&nbsp;/&nbsp;9.00.  |
        +--------+------------+--------+--------------+--------+--------+------+------------------+------------------+----------------------------------------------------------------------------------------------------------------------------------------+

    },*/

    "lock submission":undefined,/*{

        mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'lock submission' LIMIT 1;
        +---------+------------+--------+---------------+--------+--------+------+-----------------+------------------+-------------------------------------------------------------------------------+
        | id      | time       | userid | ip            | course | module | cmid | action          | url              | info                                                                          |
        +---------+------------+--------+---------------+--------+--------+------+-----------------+------------------+-------------------------------------------------------------------------------+
        | 1011147 | 1365405105 |   1667 | 212.163.190.6 |     97 | assign | 9606 | lock submission | view.php?id=9606 | Prevent any more submissions for student: (id=1438, fullname=Niyongabo Come). |
        +---------+------------+--------+---------------+--------+--------+------+-----------------+------------------+-------------------------------------------------------------------------------+

    },*/

    "revert submission to draft":undefined,/*{

        mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'revert submission to draft' LIMIT 1;
        +---------+------------+--------+--------------+--------+--------+-------+----------------------------+-------------------+-------------------------------------------------------------------------------------+
        | id      | time       | userid | ip           | course | module | cmid  | action                     | url               | info                                                                                |
        +---------+------------+--------+--------------+--------+--------+-------+----------------------------+-------------------+-------------------------------------------------------------------------------------+
        | 1004921 | 1364894804 |    943 | 37.14.118.25 |    153 | assign | 10405 | revert submission to draft | view.php?id=10405 | Revert submission to draft for student: (id=402, fullname=MARIA CRUZ GARCIA PEREZ). |
        +---------+------------+--------+--------------+--------+--------+-------+----------------------------+-------------------+-------------------------------------------------------------------------------------+

    },*/

    "submit":undefined,/*{

        mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'submit' LIMIT 1;
        +--------+------------+--------+--------------+--------+--------+------+--------+------------------+-----------------------------------------------------------------------------------------------+
        | id     | time       | userid | ip           | course | module | cmid | action | url              | info                                                                                          |
        +--------+------------+--------+--------------+--------+--------+------+--------+------------------+-----------------------------------------------------------------------------------------------+
        | 947431 | 1362313949 |   1296 | 92.253.44.22 |    103 | assign | 9757 | submit | view.php?id=9757 | Submission status: Draft (not submitted). <br><br> the number of file(s) : 2 file(s).<br><br> |
        +--------+------------+--------+--------------+--------+--------+------+--------+------------------+-----------------------------------------------------------------------------------------------+

    },*/

    "submit for grading":undefined,/*{

        mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'submit for grading' LIMIT 1;
        +--------+------------+--------+--------------+--------+--------+------+--------------------+------------------+-----------------------------------------------------------------------------------------------+
        | id     | time       | userid | ip           | course | module | cmid | action             | url              | info                                                                                          |
        +--------+------------+--------+--------------+--------+--------+------+--------------------+------------------+-----------------------------------------------------------------------------------------------+
        | 947436 | 1362314020 |   1296 | 92.253.44.22 |    103 | assign | 9757 | submit for grading | view.php?id=9757 | Submission status: Submitted for grading. <br><br> the number of file(s) : 2 file(s).<br><br> |
        +--------+------------+--------+--------------+--------+--------+------+--------------------+------------------+-----------------------------------------------------------------------------------------------+

    },*/

    "unlock submission":undefined,/*{

        mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'unlock submission' LIMIT 1;
        +---------+------------+--------+---------------+--------+--------+------+-------------------+------------------+--------------------------------------------------------------------+
        | id      | time       | userid | ip            | course | module | cmid | action            | url              | info                                                               |
        +---------+------------+--------+---------------+--------+--------+------+-------------------+------------------+--------------------------------------------------------------------+
        | 1011149 | 1365405110 |   1667 | 212.163.190.6 |     97 | assign | 9606 | unlock submission | view.php?id=9606 | Allow submissions for student: (id=1438, fullname=Niyongabo Come). |
        +---------+------------+--------+---------------+--------+--------+------+-------------------+------------------+--------------------------------------------------------------------+

    },*/

    "update":undefined,/*{

        mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'update' LIMIT 1;
        +-------+------------+--------+---------------+--------+--------+------+--------+-----------------+------+
        | id    | time       | userid | ip            | course | module | cmid | action | url             | info |
        +-------+------------+--------+---------------+--------+--------+------+--------+-----------------+------+
        | 19500 | 1246461641 |     48 | 212.163.190.6 |     18 | assign | 8447 | update | view.php?id=312 | 76   |
        +-------+------------+--------+---------------+--------+--------+------+--------+-----------------+------+

    },*/

    "update grades":undefined,/*{

        mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'update grades' LIMIT 1;
        +-------+------------+--------+----------------+--------+--------+------+---------------+-----------------------+------+
        | id    | time       | userid | ip             | course | module | cmid | action        | url                   | info |
        +-------+------------+--------+----------------+--------+--------+------+---------------+-----------------------+------+
        | 24306 | 1248099280 |     48 | 77.210.169.142 |     18 | assign | 8451 | update grades | submissions.php?id=77 | 7    |
        +-------+------------+--------+----------------+--------+--------+------+---------------+-----------------------+------+

    },*/

    "upload":undefined,/*{

        mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'upload' LIMIT 1;
        +-------+------------+--------+---------------+--------+--------+------+--------+---------------+------+
        | id    | time       | userid | ip            | course | module | cmid | action | url           | info |
        +-------+------------+--------+---------------+--------+--------+------+--------+---------------+------+
        | 22886 | 1247557848 |     20 | 212.163.190.6 |     18 | assign | 8451 | upload | view.php?a=80 | 80   |
        +-------+------------+--------+---------------+--------+--------+------+--------+---------------+------+

    },*/

    "view":undefined,/*{

        mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'view' LIMIT 1;
        +-------+------------+--------+---------------+--------+--------+------+--------+-----------------+------+
        | id    | time       | userid | ip            | course | module | cmid | action | url             | info |
        +-------+------------+--------+---------------+--------+--------+------+--------+-----------------+------+
        | 19502 | 1246461647 |     48 | 212.163.190.6 |     18 | assign | 8447 | view   | view.php?id=312 | 76   |
        +-------+------------+--------+---------------+--------+--------+------+--------+-----------------+------+

    },*/

    "view all":undefined,/*{

        mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'view all' LIMIT 1;
        +--------+------------+--------+----------------+--------+--------+------+----------+-----------------+------+
        | id     | time       | userid | ip             | course | module | cmid | action   | url             | info |
        +--------+------------+--------+----------------+--------+--------+------+----------+-----------------+------+
        | 948806 | 1362406941 |   1573 | 41.190.228.166 |     97 | assign |    0 | view all | index.php?id=97 |      |
        +--------+------------+--------+----------------+--------+--------+------+----------+-----------------+------+

    },*/

    "view feedback":undefined,/*{

        mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'view feedback' LIMIT 1;
        +--------+------------+--------+---------------+--------+--------+------+---------------+------------------+------------------------------+
        | id     | time       | userid | ip            | course | module | cmid | action        | url              | info                         |
        +--------+------------+--------+---------------+--------+--------+------+---------------+------------------+------------------------------+
        | 960782 | 1363187879 |    724 | 212.163.190.6 |     77 | assign | 9366 | view feedback | view.php?id=9366 | View feedback for user: 1090 |
        +--------+------------+--------+---------------+--------+--------+------+---------------+------------------+------------------------------+

    },*/

    "view grading form":undefined,/*{

        mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'view grading form' LIMIT 1;
        +--------+------------+--------+---------------+--------+--------+------+-------------------+------------------+---------------------------------------------------------------+
        | id     | time       | userid | ip            | course | module | cmid | action            | url              | info                                                          |
        +--------+------------+--------+---------------+--------+--------+------+-------------------+------------------+---------------------------------------------------------------+
        | 953624 | 1362659594 |   1297 | 212.163.190.6 |     97 | assign | 9573 | view grading form | view.php?id=9573 | View grading page for student: (id=73, fullname=Luz Linares). |
        +--------+------------+--------+---------------+--------+--------+------+-------------------+------------------+---------------------------------------------------------------+

    },*/

    "view submission":undefined,/*{

        mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'view submission' LIMIT 1;
        +-------+------------+--------+---------------+--------+--------+------+-----------------+-----------------------+------+
        | id    | time       | userid | ip            | course | module | cmid | action          | url                   | info |
        +-------+------------+--------+---------------+--------+--------+------+-----------------+-----------------------+------+
        | 19537 | 1246463282 |     48 | 212.163.190.6 |     18 | assign | 8447 | view submission | submissions.php?id=76 | 76   |
        +-------+------------+--------+---------------+--------+--------+------+-----------------+-----------------------+------+

    },*/

    "view submission grading table":undefined,/*{

        mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'view submission grading table' LIMIT 1;
        +--------+------------+--------+-----------------+--------+--------+------+-------------------------------+------------------+---------------------------------------------+
        | id     | time       | userid | ip              | course | module | cmid | action                        | url              | info                                        |
        +--------+------------+--------+-----------------+--------+--------+------+-------------------------------+------------------+---------------------------------------------+
        | 942019 | 1362074220 |   1578 | 217.124.190.226 |     97 | assign | 9572 | view submission grading table | view.php?id=9572 | Ver tabla de calificaciones de las entregas |
        +--------+------------+--------+-----------------+--------+--------+------+-------------------------------+------------------+---------------------------------------------+

    },*/

    "view submit assignment form":undefined,/*{

        mysql> SELECT * FROM mdl_log WHERE module='assign' AND action = 'view submit assignment form' LIMIT 1;
        +--------+------------+--------+--------------+--------+--------+------+-----------------------------+------------------+----------------------------------+
        | id     | time       | userid | ip           | course | module | cmid | action                      | url              | info                             |
        +--------+------------+--------+--------------+--------+--------+------+-----------------------------+------------------+----------------------------------+
        | 947430 | 1362313318 |   1296 | 92.253.44.22 |    103 | assign | 9757 | view submit assignment form | view.php?id=9757 | View own submit assignment page. |
        +--------+------------+--------+--------------+--------+--------+------+-----------------------------+------------------+----------------------------------+

    }*/
};

module.exports = library;
