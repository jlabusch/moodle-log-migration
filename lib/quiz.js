var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    bogus_email = require('./common.js').bogus_email,
    fix_by_shadow_index = require('./common.js').fix_by_shadow_index,
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
        sql_old:
            'SELECT log.*, ' +
                'u.id AS u_id, u.username AS u_username, u.email AS u_email, ' +
                'c.id AS course_id, c.shortname AS course_shortname, ' +
                'cm.id AS cm_id, cm.module AS module_id, cm.section AS section, cm.instance AS quiz_id, ' +
                'q.name AS quiz_name ' +
                'FROM mdl_log log ' +
                'JOIN mdl_course c ON log.course = c.id ' +
                'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
                'LEFT JOIN mdl_quiz q ON cm.instance = q.id ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                "WHERE log.module = 'quiz'" +
                "AND log.action = 'add'" +
                "AND " + restrict_clause,

        sql_match: (row) => {
            return row.cm_id ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_quiz q ON q.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND q.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'quiz',
                        row["course_shortname"],
                        row["quiz_name"],
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

    "addcategory": undefined,
        /*
        +---------+------------+--------+----------------+--------+--------+-------+-------------+-------------------+------+
        | id      | time       | userid | ip             | course | module | cmid  | action      | url               | info |
        +---------+------------+--------+----------------+--------+--------+-------+-------------+-------------------+------+
        | 1984500 | 1424254538 |     48 | 10.111.112.125 |    203 | quiz   | 24271 | addcategory | view.php?id=24271 | 474  |
        +---------+------------+--------+----------------+--------+--------+-------+-------------+-------------------+------+

        url: id => mdl_course_modules.id

        info => mdl_quiz.id

        OLD_DB returns 1 result for quiz/addcategory.
        We do not query this as course ID does not match quiz course ID, and course module does not exist either.
        */

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
        sql_old:
            'SELECT log.*, ' +
                'u.id AS u_id, u.username AS u_username, u.email AS u_email, ' +
                'c.id AS course_id, c.shortname AS course_shortname, ' +
                'cm.id AS cm_id, cm.module AS module_id, cm.section AS section, cm.instance AS quiz_id, ' +
                'q.name AS quiz_name, ' +
                'qa.id AS attempt_id ' +
                'FROM mdl_log log ' +
                'JOIN mdl_course c ON log.course = c.id ' +
                'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
                'LEFT JOIN mdl_quiz q ON cm.instance = q.id ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                'JOIN mdl_quiz_attempts qa ON q.id = qa.quiz AND log.userid = qa.userid ' +
                "WHERE log.module = 'quiz' " +
                "AND log.action = 'attempt' " +
                "AND " + restrict_clause,

        sql_match: (row) => {
            return row.attempt_id ?
                mysql.format(
                    'SELECT qa.id AS attempt_id, ' +
                    'u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_quiz_attempts qa ' +
                    'JOIN mdl_quiz q ON q.id = qa.quiz ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'JOIN mdl_course c ON c.id = q.course ' +
                    'JOIN mdl_course_modules cm ON cm.course = c.id ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'WHERE m.name = ? AND c.shortname = ? AND q.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'quiz',
                        row["course_shortname"],
                        row["quiz_name"]
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
            match_row.att_id = match_row.att_id || '';
            var updated_url = old_row.url
                                .replace(/\?attempt=\d+/, '?attempt=' + match_row.att_id);
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

        Missing matches might be caused by missing attempts records.
        */
        sql_old:
            'SELECT log.*, ' +
                'u.id AS u_id, u.username AS u_username, u.email AS u_email, ' +
                'c.id AS course_id, c.shortname AS course_shortname, ' +
                'cm.id AS cm_id, cm.module AS module_id, cm.section AS section, cm.instance AS quiz_id, ' +
                'q.name AS quiz_name, ' +
                'qa.id AS attempt_id ' +
                'FROM mdl_log log ' +
                'JOIN mdl_course c ON log.course = c.id ' +
                'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
                'LEFT JOIN mdl_quiz q ON cm.instance = q.id ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                'JOIN mdl_quiz_attempts qa ON q.id = qa.quiz AND log.userid = qa.userid ' +
                "WHERE log.module = 'quiz' " +
                "AND log.action = 'close attempt' " +
                "AND " + restrict_clause,

        sql_match: (row) => {
            return row.attempt_id ?
                mysql.format(
                    'SELECT qa.id AS attempt_id, ' +
                    'u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_quiz_attempts qa ' +
                    'JOIN mdl_quiz q ON q.id = qa.quiz ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'JOIN mdl_course c ON c.id = q.course ' +
                    'JOIN mdl_course_modules cm ON cm.course = c.id ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'WHERE m.name = ? AND c.shortname = ? AND q.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'quiz',
                        row["course_shortname"],
                        row["quiz_name"]
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
            var updated_url = old_row.url.replace(/\?attempt=\d+/, '?attempt=' + match_row.attempt_id);
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

    "continue attemp":{
        /*
        +--------+------------+--------+-------------+--------+--------+------+-----------------+-----------------------+------+
        | id     | time       | userid | ip          | course | module | cmid | action          | url                   | info |
        +--------+------------+--------+-------------+--------+--------+------+-----------------+-----------------------+------+
        | 459047 | 1323028445 |    809 | 41.95.10.37 |     49 | quiz   | 1371 | continue attemp | review.php?attempt=56 | 20   |
        +--------+------------+--------+-------------+--------+--------+------+-----------------+-----------------------+------+

        url: attempt => mdl_quiz_attempts.id

        info => mdl_quiz.id

        Missing matches might be caused by missing attempts records.
        */
        sql_old:
            'SELECT log.*, ' +
                'u.id AS u_id, u.username AS u_username, u.email AS u_email, ' +
                'c.id AS course_id, c.shortname AS course_shortname, ' +
                'cm.id AS cm_id, cm.module AS module_id, cm.section AS section, cm.instance AS quiz_id, ' +
                'q.name AS quiz_name, ' +
                'qa.id AS attempt_id ' +
                'FROM mdl_log log ' +
                'JOIN mdl_course c ON log.course = c.id ' +
                'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
                'LEFT JOIN mdl_quiz q ON cm.instance = q.id ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                'JOIN mdl_quiz_attempts qa ON q.id = qa.quiz AND log.userid = qa.userid ' +
                "WHERE log.module = 'quiz' " +
                "AND log.action = 'continue attemp' " +
                "AND " + restrict_clause,

        sql_match: (row) => {
            return row.attempt_id ?
                mysql.format(
                    'SELECT qa.id AS attempt_id, ' +
                    'u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_quiz_attempts qa ' +
                    'JOIN mdl_quiz q ON q.id = qa.quiz ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'JOIN mdl_course c ON c.id = q.course ' +
                    'JOIN mdl_course_modules cm ON cm.course = c.id ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'WHERE m.name = ? AND c.shortname = ? AND q.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'quiz',
                        row["course_shortname"],
                        row["quiz_name"]
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
            var updated_url = old_row.url.replace(/\?attempt=\d+/, '?attempt=' + match_row.attempt_id);
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

    "continue attempt":{
        /*
        +--------+------------+--------+---------------+--------+--------+-------+------------------+------------------------+------+
        | id     | time       | userid | ip            | course | module | cmid  | action           | url                    | info |
        +--------+------------+--------+---------------+--------+--------+-------+------------------+------------------------+------+
        | 950275 | 1362497761 |   1590 | 212.163.190.6 |    140 | quiz   | 10092 | continue attempt | review.php?attempt=134 | 52   |
        +--------+------------+--------+---------------+--------+--------+-------+------------------+------------------------+------+

        url: attempt => mdl_quiz_attempts.id

        info => mdl_quiz.id

        Missing matches might be caused by missing attempts records.
        */
        sql_old:
            'SELECT log.*, ' +
                'u.id AS u_id, u.username AS u_username, u.email AS u_email, ' +
                'c.id AS course_id, c.shortname AS course_shortname, ' +
                'cm.id AS cm_id, cm.module AS module_id, cm.section AS section, cm.instance AS quiz_id, ' +
                'q.name AS quiz_name, ' +
                'qa.id AS attempt_id ' +
                'FROM mdl_log log ' +
                'JOIN mdl_course c ON log.course = c.id ' +
                'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
                'LEFT JOIN mdl_quiz q ON cm.instance = q.id ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                'JOIN mdl_quiz_attempts qa ON q.id = qa.quiz AND log.userid = qa.userid ' +
                "WHERE log.module = 'quiz' " +
                "AND log.action = 'continue attempt' " +
                "AND " + restrict_clause,

        sql_match: (row) => {
            return row.attempt_id ?
                mysql.format(
                    'SELECT qa.id AS attempt_id, ' +
                    'u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_quiz_attempts qa ' +
                    'JOIN mdl_quiz q ON q.id = qa.quiz ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'JOIN mdl_course c ON c.id = q.course ' +
                    'JOIN mdl_course_modules cm ON cm.course = c.id ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'WHERE m.name = ? AND c.shortname = ? AND q.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'quiz',
                        row["course_shortname"],
                        row["quiz_name"]
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
            var updated_url = old_row.url.replace(/\?attempt=\d+/, '?attempt=' + match_row.attempt_id);
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
        sql_old:
            'SELECT log.*, ' +
                'u.id AS u_id, u.username AS u_username, u.email AS u_email, ' +
                'c.id AS course_id, c.shortname AS course_shortname, ' +
                'cm.id AS cm_id, cm.module AS module_id, cm.section AS section, cm.instance AS quiz_id, ' +
                'q.name AS quiz_name ' +
                'FROM mdl_log log ' +
                'JOIN mdl_course c ON log.course = c.id ' +
                'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
                'LEFT JOIN mdl_quiz q ON cm.instance = q.id ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                "WHERE log.module = 'quiz'" +
                "AND log.action = 'add'" +
                "AND " + restrict_clause,

        sql_match: (row) => {
            return row.cm_id ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_quiz q ON q.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND q.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'quiz',
                        row["course_shortname"],
                        row["quiz_name"],
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
        sql_old:
            'SELECT log.*, ' +
                'u.id AS u_id, u.username AS u_username, u.email AS u_email, ' +
                'c.id AS course_id, c.shortname AS course_shortname, ' +
                'cm.id AS cm_id, cm.module AS module_id, cm.section AS section, cm.instance AS quiz_id, ' +
                'q.name AS quiz_name ' +
                'FROM mdl_log log ' +
                'JOIN mdl_course c ON log.course = c.id ' +
                'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
                'LEFT JOIN mdl_quiz q ON cm.instance = q.id ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                "WHERE log.module = 'quiz'" +
                "AND log.action = 'add'" +
                "AND " + restrict_clause,

        sql_match: (row) => {
            return row.cm_id ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_quiz q ON q.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND q.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'quiz',
                        row["course_shortname"],
                        row["quiz_name"],
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

    "manualgrade":{
        /*
        +---------+------------+--------+---------------+--------+--------+-------+-------------+----------------------------------+------+
        | id      | time       | userid | ip            | course | module | cmid  | action      | url                              | info |
        +---------+------------+--------+---------------+--------+--------+-------+-------------+----------------------------------+------+
        | 1611006 | 1400598829 |    943 | 83.39.117.248 |    244 | quiz   | 18669 | manualgrade | comment.php?attempt=1068&slot=14 | 172  |
        +---------+------------+--------+---------------+--------+--------+-------+-------------+----------------------------------+------+

        url: attempt => mdl_quiz_attempts.id, slot => what slot the question is in given attempt

        info => mdl_quiz.id

        mdl_log.userid -> mdl_user.id
        mdl_log.course -> mdl.course.id
        mdl_log.cmid   -> mdl_course_modules.id
        mdl_log.info   -> mdl_quiz.id

        url:attempt                -> mdl_quiz_attempts.id
        mdl_quiz_attempts.uniqueid -> mdl_question_usages.id
        mdl_question_usages.id     -> mdl_question_attempts.questionusageid

        mdl_question_attempts.questionid -> mdl_quiz_slots.questionid

        // url:slot                   -> mdl_question_attempt.slot
        */
        sql_old:
            'SELECT log.*, ' +
                'u.id AS u_id, u.username AS u_username, u.email AS u_email, ' +
                'c.id AS course_id, c.shortname AS course_shortname, ' +
                'cm.id AS cm_id, cm.module AS module_id, cm.section AS section, cm.instance AS quiz_id, ' +
                'q.name AS quiz_name, ' +
                'qa.id AS attempt_id ' +
                'FROM mdl_log log ' +
                'JOIN mdl_course c ON c.id = log.course ' +
                'LEFT JOIN mdl_course_modules cm ON cm.id = log.cmid ' +
                'LEFT JOIN mdl_quiz q ON q.id = cm.instance ' +
                'JOIN mdl_user u ON u.id = log.userid ' +
                'JOIN mdl_quiz_attempts qa ON qa.quiz = q.id AND qa.userid = u.id ' +
                'JOIN mdl_question_attempts qea ON qea.questionusageid = qa.uniqueid ' +
                'JOIN mdl_quiz_slots qs ON qs.questionid = qea.questionid AND qs.quizid = q.id ' +
                "WHERE log.module = 'quiz' " +
                "AND log.action = 'manualgrade' " +
                "AND " + restrict_clause,

        sql_match: (row) => {
            return [row.attempt_id, row.slot] ?
                mysql.format(
                    'SELECT qa.id AS attempt_id, qs.slot AS slot, ' +
                    'u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_quiz_attempts qa ' +
                    'JOIN mdl_quiz q ON q.id = qa.quiz ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'JOIN mdl_course c ON c.id = q.course ' +
                    'JOIN mdl_course_modules cm ON cm.course = c.id ' +
                    'JOIN mdl_question_attempts qea ON qea.questionusageid = qa.uniqueid ' +
                    'JOIN mdl_quiz_slots qs ON qs.questionid = qea.questionid AND qs.quizid = q.id ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'WHERE m.name = ? AND c.shortname = ? AND q.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'quiz',
                        row["course_shortname"],
                        row["quiz_name"]
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
            match_row.attempt_id = match_row.attempt_id || '';
            match_row.slot = match_row.slot || '';
            var updated_url = old_row.url.replace(/\?attempt=\d+/, '?attempt=' + match_row.attempt_id);
            var updated_url_2 = updated_url.replace(/\?slot=\d+/, '?slot=' + match_row.slot);


            match_row.cm_id = match_row.cm_id || '';
            var updated_url = old_row.url.replace(/\?attempt=\d+/, '?attempt=' + match_row.attempt_id);
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
                                "' " + updated_url_2 + "'",
                                "' " + match_row.quiz_id + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
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
        sql_old:
            'SELECT log.*, ' +
                'u.id AS u_id, u.username AS u_username, u.email AS u_email, ' +
                'c.id AS course_id, c.shortname AS course_shortname, ' +
                'cm.id AS cm_id, cm.module AS module_id, cm.section AS section, cm.instance AS quiz_id, ' +
                'q.name AS quiz_name ' +
                'FROM mdl_log log ' +
                'JOIN mdl_course c ON log.course = c.id ' +
                'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
                'LEFT JOIN mdl_quiz q ON cm.instance = q.id ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                "WHERE log.module = 'quiz'" +
                "AND log.action = 'preview'" +
                "AND " + restrict_clause,

        sql_match: (row) => {
            return row.cm_id ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_quiz q ON q.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND q.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'quiz',
                        row["course_shortname"],
                        row["quiz_name"],
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
        sql_old:
            'SELECT log.*, ' +
                'u.id AS u_id, u.username AS u_username, u.email AS u_email, ' +
                'c.id AS course_id, c.shortname AS course_shortname, ' +
                'cm.id AS cm_id, cm.module AS module_id, cm.section AS section, cm.instance AS quiz_id, ' +
                'q.name AS quiz_name ' +
                'FROM mdl_log log ' +
                'JOIN mdl_course c ON log.course = c.id ' +
                'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
                'LEFT JOIN mdl_quiz q ON cm.instance = q.id ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                "WHERE log.module = 'quiz'" +
                "AND log.action = 'report'" +
                "AND " + restrict_clause,

        sql_match: (row) => {
            return row.cm_id ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_quiz q ON q.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND q.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'quiz',
                        row["course_shortname"],
                        row["quiz_name"],
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

    "review":{
        /*
        +--------+------------+--------+----------------+--------+--------+------+--------+-------------------------------+------+
        | id     | time       | userid | ip             | course | module | cmid | action | url                           | info |
        +--------+------------+--------+----------------+--------+--------+------+--------+-------------------------------+------+
        | 458047 | 1322985803 |    135 | 79.180.116.172 |     49 | quiz   | 1371 | review | review.php?id=1371&attempt=53 | 20   |
        +--------+------------+--------+----------------+--------+--------+------+--------+-------------------------------+------+

        url: id => mdl_course_modules.id, attempt =>

        info => mdl_quiz.id
        */
        sql_old:
            'SELECT log.*, ' +
                'u.id AS u_id, u.username AS u_username, u.email AS u_email, ' +
                'c.id AS course_id, c.shortname AS course_shortname, ' +
                'cm.id AS cm_id, cm.module AS module_id, cm.section AS section, cm.instance AS quiz_id, ' +
                'q.name AS quiz_name, ' +
                'qa.id AS attempt_id ' +
                'FROM mdl_log log ' +
                'JOIN mdl_course c ON log.course = c.id ' +
                'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
                'LEFT JOIN mdl_quiz q ON cm.instance = q.id ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                'JOIN mdl_quiz_attempts qa ON q.id = qa.quiz AND log.userid = qa.userid ' +
                "WHERE log.module = 'quiz' " +
                "AND log.action = 'review' " +
                "AND " + restrict_clause,

        sql_match: (row) => {
            return [row.cm_id, row.quiz_attempt_id] ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'qa.id AS quiz_attempt_id, ' +
                    'u.id AS u_id, u.username AS u_username, u.email AS u_email, ' +
                    'c.id AS course_id, ' +
                    'cm.id AS cm_id ' +
                    'FROM mdl_course_modules cm ' +
                    'JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_quiz q ON q.id = cm.instance ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'JOIN mdl_quiz_attempts qa ON qa.quiz = q.id AND qa.userid = u.id ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'WHERE m.name = ? AND c.shortname = ? AND q.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'quiz',
                        row["course_shortname"],
                        row["quiz_name"],
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
            match_row.quiz_attempt_id = match_row.quiz_attempt_id || '';
            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cm_id);
            var updated_url_2 = updated_url.replace(/\?attempt=\d+/, '?attempt=' + match_row.quiz_attempt_id);
            var output ='INSERT INTO mdl_log ' +
                        '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                        '(' +
                            [
                                old_row.time,
                                match_row.u_id,
                                "' " + old_row.ip + "'",
                                match_row.course_id,
                                "' " + old_row.module + "'",
                                match_row.cm_id,
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
        sql_old:
            'SELECT log.*, ' +
                'u.id AS u_id, u.username AS u_username, u.email AS u_email, ' +
                'c.id AS course_id, c.shortname AS course_shortname, ' +
                'cm.id AS cm_id, cm.module AS module_id, cm.section AS section, cm.instance AS quiz_id, ' +
                'q.name AS quiz_name ' +
                'FROM mdl_log log ' +
                'JOIN mdl_course c ON log.course = c.id ' +
                'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
                'LEFT JOIN mdl_quiz q ON cm.instance = q.id ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                "WHERE log.module = 'quiz'" +
                "AND log.action = 'update'" +
                "AND " + restrict_clause,

        sql_match: (row) => {
            return row.cm_id ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_quiz q ON q.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND q.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'quiz',
                        row["course_shortname"],
                        row["quiz_name"],
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
        sql_old:
            'SELECT log.*, ' +
                'u.id AS u_id, u.username AS u_username, u.email AS u_email, ' +
                'c.id AS course_id, c.shortname AS course_shortname, ' +
                'cm.id AS cm_id, cm.module AS module_id, cm.section AS section, cm.instance AS quiz_id, ' +
                'q.name AS quiz_name ' +
                'FROM mdl_log log ' +
                'JOIN mdl_course c ON log.course = c.id ' +
                'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
                'LEFT JOIN mdl_quiz q ON cm.instance = q.id ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                "WHERE log.module = 'quiz'" +
                "AND log.action = 'view'" +
                "AND " + restrict_clause,

        sql_match: (row) => {
            return row.cm_id ?
                mysql.format(
                    'SELECT cm.id AS cm_id, ' +
                    'u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_course_modules cm ' +
                    'LEFT JOIN mdl_course c ON c.id = cm.course ' +
                    'JOIN mdl_quiz q ON q.id = cm.instance ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'WHERE m.name = ? AND c.shortname = ? AND q.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'quiz',
                        row["course_shortname"],
                        row["quiz_name"],
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

    "view all":{ undefined,
        /*
        +--------+------------+--------+---------------+--------+--------+------+----------+-----------------+------+
        | id     | time       | userid | ip            | course | module | cmid | action   | url             | info |
        +--------+------------+--------+---------------+--------+--------+------+----------+-----------------+------+
        | 391885 | 1319714377 |    187 | 212.163.190.6 |     69 | quiz   |    0 | view all | index.php?id=69 |      |
        +--------+------------+--------+---------------+--------+--------+------+----------+-----------------+------+

        url: id => mdl_course.id

        info => N/A

        We do not run this query as there is no course module and quiz data.
        */
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
        sql_old:
            'SELECT log.*, ' +
                'u.id AS u_id, u.username AS u_username, u.email AS u_email, ' +
                'c.id AS course_id, c.shortname AS course_shortname, ' +
                'cm.id AS cm_id, cm.module AS module_id, cm.section AS section, cm.instance AS quiz_id, ' +
                'q.name AS quiz_name, ' +
                'qa.id AS attempt_id ' +
                'FROM mdl_log log ' +
                'JOIN mdl_course c ON log.course = c.id ' +
                'LEFT JOIN mdl_course_modules cm ON log.cmid = cm.id ' +
                'LEFT JOIN mdl_quiz q ON cm.instance = q.id ' +
                'JOIN mdl_user u ON log.userid = u.id ' +
                'JOIN mdl_quiz_attempts qa ON q.id = qa.quiz AND log.userid = qa.userid ' +
                "WHERE log.module = 'quiz' " +
                "AND log.action = 'view summary' " +
                "AND " + restrict_clause,

        sql_match: (row) => {
            return row.attempt_id ?
                mysql.format(
                    'SELECT qa.id AS attempt_id, ' +
                    'u.username AS u_username, u.email AS u_email ' +
                    'FROM mdl_quiz_attempts qa ' +
                    'JOIN mdl_quiz q ON q.id = qa.quiz ' +
                    'JOIN mdl_user u ON (BINARY u.email = ? OR u.username = ?) ' +
                    'JOIN mdl_course c ON c.id = q.course ' +
                    'JOIN mdl_course_modules cm ON cm.course = c.id ' +
                    'JOIN mdl_modules m ON m.id = cm.module ' +
                    'WHERE m.name = ? AND c.shortname = ? AND q.name = ?',
                    [
                        row["u_email"],
                        row["u_username"],
                        'quiz',
                        row["course_shortname"],
                        row["quiz_name"]
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
            var updated_url = old_row.url.replace(/\?attempt=\d+/, '?attempt=' + match_row.attempt_id);
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
    }
};

module.exports = library;

