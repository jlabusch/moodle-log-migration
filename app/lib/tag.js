var restrict_clause = require('./sql_restrictions.js')(),
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "update": {
        /*
        +--------+--------+-------+------------------+--------------+
        | userid | course | cmid  | url              | info         |
        +--------+--------+-------+------------------+--------------+
        | 1298   | 1      | 0     | index.php?id=365 | instalations |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> index.php?id=365 -- mdl_tag.id 
        info --> 'instalations' -- mdl_tag.name
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       t.name AS tag_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_tag t ON t.id = SUBSTRING(log.url FROM LOCATE("id=", log.url) + 3) ' +
                    "WHERE log.module = 'tag' AND log.action = 'update' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       t.id AS tagid, t.name as tagname ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_tag t ON t.userid = u.id AND BINARY t.name = ? ' +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["email"],
                    row["tag_name"],
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
            var updated_url = old_row.url.replace(/id=\d+/, 'id=' + match_row.tagid);
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
                                "'" + match_row.tagname + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    }
}

module.exports = library;


