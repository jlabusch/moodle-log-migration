var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    bogus_email = require('./common.js').bogus_email,
    fix_by_shadow_index = require('./common.js').fix_by_shadow_index,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "add": undefined,
    "addcategory": undefined,
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
                    '       u.email, u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       cm.instance AS module_instance, ' +
                    '       q.name AS quiz_name, q.intro AS quiz_intro, ' +
                    '       a.id as att_id, ' +
                    '       a.uniqueid as att_uniqueid, ' +
                    '       a.timestart as att_start, ' +
                    '       a.attempt as att_num ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm ON cm.id = log.cmid ' +
                    'JOIN mdl_quiz q ON q.id = cm.instance ' +
                    "JOIN mdl_quiz_attempts a ON a.id = (select REPLACE(log.url, 'review.php?attempt=', '')) " +
                    "WHERE log.module = 'quiz' AND log.action = 'attempt' AND " + restrict_clause,

        sql_match:  (row) => {
            return row.att_id ?
                    mysql.format(
                        'SELECT c.id AS course, ' +
                        '       a.id AS att_id, a.uniqueid AS att_uniqueid, a.timestart AS att_start, ' +
                        '       q.id AS quiz_id, ' +
                        '       u.id AS userid, u.username ' +
                        'FROM mdl_quiz_attempts a ' +
                        'JOIN mdl_quiz q ON q.id = a.quiz ' +
                        'JOIN mdl_course c ON c.id=q.course ' +
                        'JOIN mdl_user u ON BINARY u.email = ? ' +
                        'WHERE a.timestart = ? AND q.name = ? AND c.shortname = ?',
                        [
                            row["email"],
                            row["att_start"],
                            row["quiz_name"],
                            row["course_shortname"]
                        ]
                    )
                    :
                    mysql.format(
                        'SELECT c.id AS course, ' +
                        '       q.id AS quiz_id, q.intro as quiz_intro, ' +
                        '       u.id AS userid, u.username ' +
                        'FROM mdl_course c ' +
                        'JOIN mdl_quiz q ON q.course=c.id ' +
                        'JOIN mdl_user u ON BINARY u.email = ? ' +
                        'WHERE c.shortname = ? AND q.name = ? AND q.intro = ?',
                        [
                            row["email"],
                            row["course_shortname"],
                            row["quiz_name"],
                            row["quiz_intro"]
                        ]
                    );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.username;
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
                                "'" + old_row.ip + "'",
                                match_row.course,
                                "'" + old_row.module + "'",
                                match_row.cmid,
                                "'" + old_row.action + "'",
                                "'" + updated_url + "'",
                                "'" + match_row.quiz_id + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "close attempt": undefined,
    "continue attemp": undefined,
    "continue attempt": undefined,
    "delete attempt": undefined,
    "editquestions": undefined,
    "manualgrade": undefined,
    "preview": undefined,
    "report": undefined,
    "review": undefined,
    "update": undefined,
    "view": undefined,
    "view all": undefined,
    "view summary": undefined
};

module.exports = library;

