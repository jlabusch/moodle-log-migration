var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "add":{
        /*
        +--------+------------+--------+---------------+--------+--------+------+--------+------------------+------+
        | id     | time       | userid | ip            | course | module | cmid | action | url              | info |
        +--------+------------+--------+---------------+--------+--------+------+--------+------------------+------+
        | 855990 | 1355075808 |   1418 | 92.56.173.165 |    110 | quiz   | 7640 | add    | view.php?id=7640 | 29   |
        +--------+------------+--------+---------------+--------+--------+------+--------+------------------+------+

        url: id => mdl_course_modules.id
        info => mdl_quiz.id
        */
        sql_old:    'SELECT log.*, ' +
                    'c.shortname AS course_shortname, ' +
                    'u.username, u.email, ' +
                    'q.name AS quiz_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm ON cm.id = log.cmid ' +
                    'JOIN mdl_quiz q ON q.id = cm.instance AND q.id = log.info ' +
                    "WHERE log.module = 'quiz' AND log.action = 'add' AND " + restrict_clause,

        sql_match: (row) => {
            return mysql.format(
                'SELECT cm.id AS cmid, '+
                'c.id AS course, c.shortname AS course_shortname, '+
                'q.id AS quiz_id, q.name AS quiz_name, ' +
                'u.id AS userid, u.username, u.email ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_quiz q ON q.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = q.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'quiz') " +
                'WHERE c.shortname = ? ',
                [
                    row["username"],
                    row["email"],
                    row["quiz_name"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cmid);
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

    "addcategory": {
        /*
        +---------+------------+--------+----------------+--------+--------+-------+-------------+-------------------+------+
        | id      | time       | userid | ip             | course | module | cmid  | action      | url               | info |
        +---------+------------+--------+----------------+--------+--------+-------+-------------+-------------------+------+
        | 1984500 | 1424254538 |     48 | 10.111.112.125 |    203 | quiz   | 24271 | addcategory | view.php?id=24271 | 474  |
        +---------+------------+--------+----------------+--------+--------+-------+-------------+-------------------+------+

        url: id => mdl_course_modules.id
        info => mdl_quiz.id
        */
        alias: () => { make_alias(library, 'addcategory', 'add') }
    },
    "attempt": {
        /*
        | userid | course | cmid | url                   | info |
        +--------+--------+------+-----------------------+------+
        |    135 |     49 | 1371 | review.php?attempt=53 | 20   |
                             |                        |     |
                             |                        v     |
                             |         mdl_quiz_attempts.id |
                             |                              |
                             `- mdl_course_modules.id       v
                                  `-> mdl_course_modules.instance == mdl_quiz.id
        */
        sql_old:    'SELECT log.*, ' +
                    'c.shortname AS course_shortname, ' +
                    'u.username, u.email, ' +
                    'q.name AS quiz_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm ON cm.id = log.cmid ' +
                    'JOIN mdl_quiz q ON q.id = cm.instance AND q.id = log.info ' +
                    "WHERE log.module = 'quiz' AND log.action = 'attempt' AND " + restrict_clause,

        sql_match: (row) => {
            return mysql.format(
                'SELECT cm.id AS cmid, '+
                'c.id AS course, c.shortname AS course_shortname, '+
                'q.id AS quiz_id, q.name AS quiz_name, ' +
                'u.id AS userid, u.username, u.email, ' +
                'qa.id AS attempt_id ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_quiz q ON q.name = ? ' +                
                'LEFT JOIN mdl_quiz_attempts qa ON qa.quiz = q.id AND qa.userid = u.id ' +
                'JOIN mdl_course_modules cm ON cm.instance = q.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'quiz') " +
                'WHERE c.shortname = ? ',
                [
                    row["username"],
                    row["email"],
                    row["quiz_name"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url;
            if(match_row.attempt_id != null){
                updated_url = old_row.url.replace(/\?attempt=\d+/, '?attempt=' + match_row.attempt_id);           
            } else {
                updated_url = old_row.url + "#attempt_id_not_migrated";
            }
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

    "close attempt":{
        /*
        +--------+------------+--------+----------------+--------+--------+------+---------------+-----------------------+------+
        | id     | time       | userid | ip             | course | module | cmid | action        | url                   | info |
        +--------+------------+--------+----------------+--------+--------+------+---------------+-----------------------+------+
        | 458046 | 1322985802 |    135 | 79.180.116.172 |     49 | quiz   | 1371 | close attempt | review.php?attempt=53 | 20   |
        +--------+------------+--------+----------------+--------+--------+------+---------------+-----------------------+------+

        url: attempt => mdl_quiz_attempts.id
        info => mdl_quiz.id
        */
        alias: () => { make_alias(library, 'close attempt', 'attempt') }
    },

    "continue attemp":{
        /*
        +--------+------------+--------+-------------+--------+--------+------+-----------------+-----------------------+------+
        | id     | time       | userid | ip          | course | module | cmid | action          | url                   | info |
        +--------+------------+--------+-------------+--------+--------+------+-----------------+-----------------------+------+
        | 459047 | 1323028445 |    809 | 41.95.10.37 |     49 | quiz   | 1371 | continue attemp | review.php?attempt=56 | 20   |
        +--------+------------+--------+-------------+--------+--------+------+-----------------+-----------------------+------+

        url: attempt => mdl_quiz_attempts.id
        info => mdl_quiz.id
        */
        alias: () => { make_alias(library, 'continue attemp', 'attempt') }
    },

    "continue attempt":{
        /*
        +--------+------------+--------+---------------+--------+--------+-------+------------------+------------------------+------+
        | id     | time       | userid | ip            | course | module | cmid  | action           | url                    | info |
        +--------+------------+--------+---------------+--------+--------+-------+------------------+------------------------+------+
        | 950275 | 1362497761 |   1590 | 212.163.190.6 |    140 | quiz   | 10092 | continue attempt | review.php?attempt=134 | 52   |
        +--------+------------+--------+---------------+--------+--------+-------+------------------+------------------------+------+

        url: attempt => mdl_quiz_attempts.id
        info => mdl_quiz.id
        */
        alias: () => { make_alias(library, 'continue attempt', 'attempt') }
    },

    "delete attempt":{
        /*
        +---------+------------+--------+----------------+--------+--------+-------+----------------+---------------------+------+
        | id      | time       | userid | ip             | course | module | cmid  | action         | url                 | info |
        +---------+------------+--------+----------------+--------+--------+-------+----------------+---------------------+------+
        | 1228816 | 1374316956 |   1766 | 142.161.84.108 |    182 | quiz   | 13192 | delete attempt | report.php?id=13192 | 209  |
        +---------+------------+--------+----------------+--------+--------+-------+----------------+---------------------+------+

        url: id => mdl_course_modules.id
        info => mdl_quiz.id
        */
        alias: () => { make_alias(library, 'delete attempt', 'add') }
    },

    "editquestions":{
        /*
        +--------+------------+--------+---------------+--------+--------+------+---------------+------------------+------+
        | id     | time       | userid | ip            | course | module | cmid | action        | url              | info |
        +--------+------------+--------+---------------+--------+--------+------+---------------+------------------+------+
        | 483254 | 1323882078 |    187 | 212.163.190.6 |     72 | quiz   | 3758 | editquestions | view.php?id=3758 | 23   |
        +--------+------------+--------+---------------+--------+--------+------+---------------+------------------+------+

        url: id => mdl_course_modules.id
        info => mdl_quiz.id
        */
        alias: () => { make_alias(library, 'editquestions', 'add') }
    },

    "manualgrade":{
        /*
        +---------+------------+--------+---------------+--------+--------+-------+-------------+----------------------------------+------+
        | id      | time       | userid | ip            | course | module | cmid  | action      | url                              | info |
        +---------+------------+--------+---------------+--------+--------+-------+-------------+----------------------------------+------+
        | 1611006 | 1400598829 |    943 | 83.39.117.248 |    244 | quiz   | 18669 | manualgrade | comment.php?attempt=1068&slot=14 | 172  |
        +---------+------------+--------+---------------+--------+--------+-------+-------------+----------------------------------+------+

        url: attempt => mdl_quiz_attempts.id, slot => not an ID, int() indicating the "order" of the questions, what slot the question is in given attempt
        info => mdl_quiz.id
        */
        alias: () => { make_alias(library, 'manualgrade', 'attempt') }        
    },

    "preview":{
        /*
        +--------+------------+--------+---------------+--------+--------+------+---------+---------------------+------+
        | id     | time       | userid | ip            | course | module | cmid | action  | url                 | info |
        +--------+------------+--------+---------------+--------+--------+------+---------+---------------------+------+
        | 483232 | 1323881996 |    187 | 212.163.190.6 |     72 | quiz   | 3758 | preview | attempt.php?id=3758 | 23   |
        +--------+------------+--------+---------------+--------+--------+------+---------+---------------------+------+

        url: id => mdl_course_modules.id
        info => mdl_quiz.id
        */
        alias: () => { make_alias(library, 'preview', 'add') }
    },

    "report":{
        /*
        +--------+------------+--------+---------------+--------+--------+------+--------+--------------------+------+
        | id     | time       | userid | ip            | course | module | cmid | action | url                | info |
        +--------+------------+--------+---------------+--------+--------+------+--------+--------------------+------+
        | 481528 | 1323694702 |    187 | 212.163.190.6 |     49 | quiz   | 1371 | report | report.php?id=1371 | 20   |
        +--------+------------+--------+---------------+--------+--------+------+--------+--------------------+------+

        url: id => mdl_course_modules.id
        info => mdl_quiz.id
        */
        alias: () => { make_alias(library, 'report', 'add') }
    },

    "review":{
        /*
        +--------+------------+--------+----------------+--------+--------+------+--------+-------------------------------+------+
        | id     | time       | userid | ip             | course | module | cmid | action | url                           | info |
        +--------+------------+--------+----------------+--------+--------+------+--------+-------------------------------+------+
        | 458047 | 1322985803 |    135 | 79.180.116.172 |     49 | quiz   | 1371 | review | review.php?id=1371&attempt=53 | 20   |
        +--------+------------+--------+----------------+--------+--------+------+--------+-------------------------------+------+

        url: id => mdl_course_modules.id, attempt => mdl_quiz_attempts.id
        info => mdl_quiz.id
        */
        sql_old:    'SELECT log.*, ' +
                    'c.shortname AS course_shortname, ' +
                    'u.username, u.email, ' +
                    'q.name AS quiz_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm ON cm.id = log.cmid ' +
                    'JOIN mdl_quiz q ON q.id = cm.instance AND q.id = log.info ' +
                    'JOIN mdl_quiz_attempts qa ON qa.quiz = q.id AND qa.userid = u.id ' +
                    "WHERE log.module = 'quiz' AND log.action = 'review' AND " + restrict_clause,

        sql_match: (row) => {
            return mysql.format(
                'SELECT cm.id AS cmid, '+
                'c.id AS course, c.shortname AS course_shortname, '+
                'q.id AS quiz_id, q.name AS quiz_name, ' +
                'u.id AS userid, u.username, u.email, ' +
                'qa.id AS attempt_id ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_quiz q ON q.name = ? ' +                
                'LEFT JOIN mdl_quiz_attempts qa ON qa.quiz = q.id AND qa.userid = u.id ' +
                'JOIN mdl_course_modules cm ON cm.instance = q.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'quiz') " +
                'WHERE c.shortname = ? ',
                [
                    row["username"],
                    row["email"],
                    row["quiz_name"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url.replace(/\id=\d+/, 'id=' + match_row.cmid)
            if(match_row.attempt_id != null){
                updated_url = updated_url.replace(/\attempt=\d+/, 'attempt=' + match_row.attempt_id);           
            } else {
                updated_url = updated_url + "#attempt_id_not_migrated";
            }
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

    "update":{
        /*
        +--------+------------+--------+---------------+--------+--------+------+--------+------------------+------+
        | id     | time       | userid | ip            | course | module | cmid | action | url              | info |
        +--------+------------+--------+---------------+--------+--------+------+--------+------------------+------+
        | 823370 | 1352719090 |    449 | 212.163.190.6 |     49 | quiz   | 1371 | update | view.php?id=1371 | 20   |
        +--------+------------+--------+---------------+--------+--------+------+--------+------------------+------+

        url: id => mdl_course_modules.id
        info => mdl_quiz.id
        */
        alias: () => { make_alias(library, 'update', 'add') }
    },

    "view":{
        /*
        +--------+------------+--------+---------------+--------+--------+------+--------+------------------+------+
        | id     | time       | userid | ip            | course | module | cmid | action | url              | info |
        +--------+------------+--------+---------------+--------+--------+------+--------+------------------+------+
        | 457339 | 1322920519 |    811 | 41.221.159.84 |     49 | quiz   | 1371 | view   | view.php?id=1371 | 20   |
        +--------+------------+--------+---------------+--------+--------+------+--------+------------------+------+

        url: id => mdl_course_modules.id
        info => mdl_quiz.id
        */
        alias: () => { make_alias(library, 'view', 'add') }
    },

    "view all": {
        /*
        +--------+------------+--------+---------------+--------+--------+------+----------+-----------------+------+
        | id     | time       | userid | ip            | course | module | cmid | action   | url             | info |
        +--------+------------+--------+---------------+--------+--------+------+----------+-----------------+------+
        | 391885 | 1319714377 |    187 | 212.163.190.6 |     69 | quiz   |    0 | view all | index.php?id=69 |      |
        +--------+------------+--------+---------------+--------+--------+------+----------+-----------------+------+

        url: id => mdl_course.id
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'quiz' AND log.action = 'view all' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname, ' +
                '       u.id AS userid, u.username, u.email ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'WHERE c.shortname = ? ',
                [
                    row["username"],
                    row["email"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
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
                                "'" + old_row.info + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "view summary":{
        /*
        +--------+------------+--------+---------------+--------+--------+-------+--------------+-------------------------+------+
        | id     | time       | userid | ip            | course | module | cmid  | action       | url                     | info |
        +--------+------------+--------+---------------+--------+--------+-------+--------------+-------------------------+------+
        | 950281 | 1362497828 |   1590 | 212.163.190.6 |    140 | quiz   | 10092 | view summary | summary.php?attempt=134 | 52   |
        +--------+------------+--------+---------------+--------+--------+-------+--------------+-------------------------+------+

        url: attempt => mdl_quiz_attempts.id
        info => mdl_quiz.id
        */
        alias: () => { make_alias(library, 'view summary', 'attempt') }
    }
};

module.exports = library;

