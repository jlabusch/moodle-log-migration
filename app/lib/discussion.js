var restrict_clause = require('./sql_restrictions.js')(),
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "mark read": {
        /*
        +--------+--------+-------+-----------------+------+
        | userid | course | cmid  | url             | info |
        +--------+--------+-------+-----------------+------+
        | 74     | 38     | 715   | view.php?f=157  | 833  |

        userid --> mdl_user.id
        ip -> empty
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> view.php?f=132
                            |___= mdl_forum.id
        info --> mdl_forum_discussions.id
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname, ' +     
                    '       d.name as discussion_name, ' +
                    '       f.name AS forum_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_forum f ON f.id = cm.instance and f.course = c.id and f.id = SUBSTRING(log.url FROM LOCATE("f=", log.url) + 2) ' +             
                    'JOIN mdl_forum_discussions d ON d.id = log.info ' +
                    "WHERE log.module = 'discussion' AND log.action = 'mark read' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid, cm.instance AS module_instance, ' + 
                '       d.id as did, d.name as discussion_name, ' +
                '       f.id as forumid, f.name AS forum_name ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_forum f ON f.course = c.id AND BINARY f.name = ? ' +
                'JOIN mdl_forum_discussions d ON d.course = c.id AND d.forum = f.id AND BINARY d.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = f.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'discussion') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["email"],
                    row["forum_name"],
                    row["discussion_name"],
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
            var updated_url = old_row.url.replace(/f=\d+/, 'f=' + match_row.forumid);
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
                                "'" + match_row.did + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    }
}

module.exports = library;


