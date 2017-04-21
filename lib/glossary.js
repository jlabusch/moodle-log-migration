var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    bogus_email = require('./common.js').bogus_email,
    fix_by_shadow_index = require('./common.js').fix_by_shadow_index,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "add": {
        /*

        +--------+--------+------+-----------------+------+
        | userid | course | cmid | url             | info |
        +--------+--------+------+-----------------+------+
        |     48 |     18 |  306 | view.php?id=306 |  20  |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> view.php?id=mdl_course_modules.id 
        info --> mdl_glossary.id & mdl_course_modules.instance 

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       g.name AS glossary_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_glossary g ON g.id = cm.instance and g.course = log.course ' +
                    "WHERE log.module = 'glossary' AND log.action = 'add' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username as uname, ' +
                '       cm.id AS cmid, ' +
                '       g.id AS glossaryid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ?  ' +
                'JOIN mdl_glossary g ON g.course = c.id AND BINARY g.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = g.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'glossary') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["glossary_name"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
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
                                "'" + match_row.glossaryid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "add category": {        
        /*

        +--------+--------+--------+-----------------------------+-------+
        | userid | course |  cmid  | url                         | info  |
        +--------+--------+--------+-----------------------------+-------+
        |      2 |    170 |  11102 | editcategories.php?id=11102 |  145  |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> editcategories.php?id=mdl_course_modules.id 
        info --> mdl_glossary_category.id 

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       g.name AS glossary_name, ' +
                    '       gc.name AS category_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_glossary g ON g.id = cm.instance and g.course = log.course ' +
                    'JOIN mdl_glossary_categories gc ON gc.id = log.info AND gc.glossaryid = g.id ' +
                    "WHERE log.module = 'glossary' AND log.action = 'add category' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username as uname, ' +
                '       cm.id AS cmid, ' +
                '       gc.id AS categoryid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ?  ' +
                'JOIN mdl_glossary g ON g.course = c.id AND BINARY g.name = ? ' +
                'JOIN mdl_glossary_categories gc ON gc.glossaryid = g.id AND BINARY gc.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = g.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'glossary') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["glossary_name"],
                    row["category_name"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
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
                                "'" + match_row.categoryid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "add comment": {                
        /*

        +--------+--------+--------+---------------------------+------+
        | userid | course | cmid | url                         | info |
        +--------+--------+--------+---------------------------+------+
        |   1057 |     30 |  555 | comments.php?id=555&eid=470 |   5  |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> comments.php?id=555&eid=470
                          |             |_______ = mdl_glossary_entries.id
                          |_____________________ = mdl_course_module.id
        info --> comments count


        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       g.name AS glossary_name, ' +
                    '       ge.timecreated AS entry_time ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_glossary g ON g.id = cm.instance and g.course = log.course ' +
                    'JOIN mdl_glossary_entries ge ON ge.id = SUBSTRING(log.url FROM LOCATE("&eid",log.url) + 5) AND ge.glossaryid = g.id ' +
                    "WHERE log.module = 'glossary' AND log.action = 'add comment' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username as uname, ' +
                '       cm.id AS cmid, ' +
                '       ge.id AS entryid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ?  ' +
                'JOIN mdl_glossary g ON g.course = c.id AND BINARY g.name = ? ' +
                'JOIN mdl_glossary_entries ge ON ge.glossaryid = g.id AND BINARY ge.timecreated = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = g.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'glossary') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["glossary_name"],
                    row["entry_time"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/id=\d+/, 'id=' + match_row.cmid)
                                .replace(/&eid=\d+/, '&eid=' + match_row.entryid);
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
                                "'" + old_row.info + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "add entry": {      
        /*

        +--------+--------+------+------------------------------------+-------+
        | userid | course | cmid | url                                | info  |
        +--------+--------+--------+----------------------------------+-------+
        |     20 |     18 |  306 | view.php?id=306&mode=entry&hook=29 |  29  |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> view.php?id=306&mode=entry&hook=29
                          |                 |_______ = mdl_glossary_entries.id
                          |_________________________ = mdl_course_module.id
        info --> mdl_glossary_entries.id 

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       g.name AS glossary_name, ' +
                    '       ge.timecreated AS entry_time ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_glossary g ON g.id = cm.instance and g.course = log.course ' +
                    'JOIN mdl_glossary_entries ge ON ge.id = log.info AND ge.glossaryid = g.id ' +
                    "WHERE log.module = 'glossary' AND log.action = 'add entry' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username as uname, ' +
                '       cm.id AS cmid, ' +
                '       ge.id AS entryid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ?  ' +
                'JOIN mdl_glossary g ON g.course = c.id AND BINARY g.name = ? ' +
                'JOIN mdl_glossary_entries ge ON ge.glossaryid = g.id AND BINARY ge.timecreated = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = g.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'glossary') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["glossary_name"],
                    row["entry_time"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/id=\d+/, 'id=' + match_row.cmid)
                                .replace(/hook=\d+/, 'hook=' + match_row.entryid);
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
                                "'" + match_row.entryid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "delete entry": {       
        /*

        +--------+--------+------+------------------------------------+-------+
        | userid | course | cmid | url                                | info  |
        +--------+--------+--------+----------------------------------+-------+
        |      2 |    244 |  18603 | view.php?id=18603&mode=&hook=ALL |  29  |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> view.php?id=306&mode=entry&hook=29
                          |                 |_______ = mdl_glossary_entries.id
                          |_________________________ = mdl_course_module.id
        info --> mdl_glossary_entries.id 

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       g.name AS glossary_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_glossary g ON g.id = cm.instance and g.course = log.course ' +
                    "WHERE log.module = 'glossary' AND log.action = 'delete entry' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username as uname, ' +
                '       cm.id AS cmid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ?  ' +
                'JOIN mdl_glossary g ON g.course = c.id AND BINARY g.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = g.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'glossary') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["glossary_name"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
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
                                "'" + match_row.entryid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "edit category": { 
        alias: () => { make_alias(library, 'edit category', 'add category') }
    },
    "update": {
        alias: () => { make_alias(library, 'update', 'add') }
    },
    "update entry": {
        alias: () => { make_alias(library, 'update entry', 'add entry') }
    },
    "view": {
        alias: () => { make_alias(library, 'view', 'add') }
    },
    "view all": {     
        /*
        +---------+--------+------+------------------+------+
        |  userid | course | cmid |              url | info |
        +---------+--------+------+------------------+------+
        |       2 |    18  |  0   |  index.php?id=18 |      |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> always 0
        url --> index.php?id=18
                            |________= mdl_course.id
        info --> empty

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'glossary' AND log.action = 'view all' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username AS uname ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ? ' +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
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
                                "'" + old_row.info + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "view entry": {

        /*

        +--------+--------+--------+-----------------------+-------+
        | userid | course |   cmid | url                   | info  |
        +--------+--------+--------+-----------------------+-------+
        |   1766 |    182 |  13112 | showentry.php?eid=721 |  721  |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> showentry.php?eid=721
                                   |_______ = mdl_glossary_entries.id
        info --> mdl_glossary_entries.id 

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       g.name AS glossary_name, ' +
                    '       ge.timecreated AS entry_time ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_glossary g ON g.id = cm.instance and g.course = log.course ' +
                    'JOIN mdl_glossary_entries ge ON ge.id = log.info AND ge.glossaryid = g.id ' +
                    "WHERE log.module = 'glossary' AND log.action = 'view entry' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username as uname, ' +
                '       cm.id AS cmid, ' +
                '       ge.id AS entryid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ?  ' +
                'JOIN mdl_glossary g ON g.course = c.id AND BINARY g.name = ? ' +
                'JOIN mdl_glossary_entries ge ON ge.glossaryid = g.id AND BINARY ge.timecreated = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = g.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'glossary') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["glossary_name"],
                    row["entry_time"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/eid=\d+/, 'eid=' + match_row.entryid);
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
                                "'" + match_row.entryid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    }
}

module.exports = library;


