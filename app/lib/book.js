var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "add": {
        /*

        +--------+--------+-------+-------------------+------+
        | userid | course | cmid  | url               | info |
        +--------+--------+-------+-------------------+------+
        | 1238   | 143    | 10237 | view.php?id=10237 | 1    |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> view.php?id=mdl_course_modules.id 
        info --> mdl_book.id & mdl_course_modules.instance 
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       b.name AS book_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm ON cm.id = log.cmid ' +
                    'JOIN mdl_book b ON b.id = cm.instance AND b.course = c.id AND b.id = log.info ' +
                    "WHERE log.module = 'book' AND log.action = 'add' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid, ' +
                '       b.id AS bookid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_book b ON b.course = c.id AND BINARY b.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = b.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'book') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["email"],
                    row["book_name"],
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
            var updated_url = old_row.url
                                .replace(/id=\d+/, 'id=' + match_row.cmid);
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
                                "'" + match_row.bookid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "print": { 
        /*

        +--------+--------+-------+---------------------------------------------+------+
        | userid | course | cmid  | url                                         | info |
        +--------+--------+-------+---------------------------------------------+------+
        | 2716   | 277    | 22289 | tool/print/index.php?id=22289&chapterid=164 | 40   |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> tool/print/index.php?id=22289&chapterid=164 -- id refers to mdl_course_modules.id, chapterid is optional & refers to mdl_book_chapters.id
        info --> mdl_book.id & mdl_course_modules.instance 
        */
        sql_old:    'SELECT log.*, ' +
                    '       (log.url like "%chapterid%") AS with_chapter, ' + 
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       bc.title AS chapter_name, ' +
                    '       b.name AS book_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm ON cm.id = log.cmid ' +
                    'JOIN mdl_book b ON b.id = cm.instance AND b.course = c.id AND b.id = log.info ' +
                    'LEFT JOIN mdl_book_chapters bc ON bc.id = SUBSTRING(log.url FROM (CASE WHEN LOCATE("&chapterid", log.url) > 0 THEN (LOCATE("&chapterid=", log.url) + 11) ELSE 0 END)) AND bc.bookid = b.id ' +
                    "WHERE log.module = 'book' AND log.action = 'print' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid, ' +
                '       bc.id AS chapterid, ' +
                '       b.id AS bookid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_book b ON b.course = c.id AND BINARY b.name = ? ' +
                'LEFT JOIN mdl_book_chapters bc ON bc.bookid = b.id AND BINARY bc.title = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = b.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'book') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["email"],
                    row["book_name"],
                    row["chapter_name"],
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
            var updated_url = old_row.url.replace(/\?id=\d+/, '\?id=' + match_row.cmid);
            if (old_row.with_chapter == true) {
                updated_url = updated_url.replace(/chapterid=\d+/, 'chapterid=' + match_row.chapterid);
            }
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
                                "'" + match_row.bookid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "update": {
        alias: () => { make_alias(library, 'update', 'print') }
    },
    "view": {
        alias: () => { make_alias(library, 'view', 'print') }
    },
    "view all": { 
        /*
        +--------+--------+------+------------------+------+
        | userid | course | cmid | url              | info |
        +--------+--------+------+------------------+------+
        | 1581   | 140    | 0    | index.php?id=140 | 140  |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> 0
        url --> index.php?id=mdl_course.id 
        info --> mdl_course.id
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'folder' AND log.action = 'view all' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
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
            var updated_url = old_row.url
                                .replace(/id=\d+/, 'id=' + match_row.course);
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
                                "'" + match_row.course + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    }
}

module.exports = library;


