var restrict_clause = require('./sql_restrictions.js')(),
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "mailer": {
        /*
        +--------+--------+------+---------------------------------------------------+-----------------------------------------------------+
        | userid | course | cmid | url                                               | info                                                |
        +--------+--------+------+---------------------------------------------------+-----------------------------------------------------+
        |     48 |      1 |   0  | http://ecampus.msf.org/moodlemsf/course/enrol.php |  ERROR: SMTP Error: Could not connect to SMTP host. |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname) [always 1]
        cmid -->  always 0
        url --> empty [20185 rows]
        url --> 'cron' [8602 rows]
        url -->  different urls [1212 rows] 890 with ids
        info --> different error messages
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'library' AND log.action = 'mailer' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname, ' +
                '       u.id AS userid, u.username, u.email ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'WHERE c.shortname = ?',
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
            var updated_url;
            if (old_row.url.indexOf('id=') !== -1) {
                updated_url = old_row.url + '#id_not_migrated';
            } else {
                updated_url = old_row.url;
            }
            updated_url = updated_url.substring(0,100);

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
    }
}

module.exports = library;


