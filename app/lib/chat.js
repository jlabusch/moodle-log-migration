var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "add": {	
        /*

        | userid | course |  cmid | url                             | info |
        +--------+--------+-------+---------------------------------+------+
        |    48  |     18 |   337 |              view.php?id=337    |  30  |
        |    2   |     18 |   330 |              view.php?id=330    |  29  |
             |         |       |                               |        |
        mdl_user.id    |       |                               |        |
                mdl_course.id  |                               |        |
                      mdl_course_modules.id                    |        |
                                            mdl_course_modules.id       |
                                                                    mdl_chat.id 
        ========
         PASS 1
        ========
        SELECT course,cmid,url FROM `mdl_log` WHERE module='resource' AND action='add' AND id=20015
        +--------+-------+--------------------------------+
        | course | cmid  | url                            |
        +--------+-------+--------------------------------+
        |    18  | 337   | view.php?id=337                |
        +--------+-------+--------------------------------+

        SELECT course,instance FROM `mdl_course_modules` WHERE  id=337
        +--------+----------+
        | course | instance |
        +--------+----------+
        |    18  |     30   | --> mdl_chat.id
        +--------+----------+

        SELECT shortname FROM `mdl_course` WHERE  id=18
        +----------------------+
        | shortname            |
        +----------------------+
        | BTJuly 2009          |
        +----------------------+

        SELECT course,name FROM `mdl_chat` WHERE  id=39
        +--------+-----------------------------+
        | course | name                        |
        +--------+-----------------------------+
        |    18  | Module 4: Chat Room         | 
        +--------+-----------------------------+
        */
        sql_old:    'SELECT log.*, ch.id AS chat_id, ' +
                '       u.username, u.email, ' +
                '       ch.name AS chat_name, ' +
                '       c.shortname AS course_shortname ' +
                'FROM mdl_log log ' +
                'JOIN mdl_user u on u.id = log.userid ' +
                'JOIN mdl_course c ON c.id = log.course ' +
                'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                'JOIN mdl_chat ch on ch.id = log.info AND ch.id = cm.instance ' +
                "WHERE log.module = 'chat' AND log.action = 'add' AND " + restrict_clause,
        
        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       ch.id AS chat_id, ch.name AS chat_name, ' + 
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_chat ch ON ch.course = c.id ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ? ) ' +
                'JOIN mdl_course_modules cm ON cm.course = c.id AND cm.module = ' +
                    "   (SELECT id from mdl_modules where name = 'chat') " +
                'WHERE c.shortname = ? AND ch.name = ?',
            [
                row["username"],
                row["email"],
                row["course_shortname"],
                row["chat_name"]
            ]
        )
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
                                "'" + old_row.ip + "'",
                                match_row.course,
                                "'" + old_row.module + "'",
                                match_row.cmid ,
                                "'" + old_row.action + "'",
                                "'" + updated_url + "'",
                                "'" + match_row.chat_id + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "report": {
        alias: () => { make_alias(library, 'report', 'add') }
    },
    "talk": {
        alias: () => { make_alias(library, 'talk', 'add') }
    },
    "update": {
        alias: () => { make_alias(library, 'update', 'add') }
    },
    "view": {
        alias: () => { make_alias(library, 'view', 'add') }
    },
    "view all": {
      /*      

        | userid | course |  cmid | url                             | info |
        +--------+--------+-------+---------------------------------+------+
        |  1581  |    140 |    0  |              view.php?id=140    |      |
        |   566  |     96 |    0  |              view.php?id=96     |      |
             |         |       |                              |        
        mdl_user.id    |       |                              |        
                mdl_course.id  |                              |        
                      mdl_course_modules.id                   |       
                                                    mdl_course.id               
        */
        sql_old:    'SELECT log.*, ' +
            '       u.username, u.email, ' +
            '       c.shortname AS course_shortname ' +
            'FROM mdl_log log ' +
            'JOIN mdl_user u on u.id = log.userid ' +
            'JOIN mdl_course c ON c.id = log.course ' +
            "WHERE log.module = 'page' AND log.action = 'view all' AND " + restrict_clause,
    
        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username, u.email ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ? ) ' +
                'WHERE c.shortname = ?',
            [
                row["username"],
                row["email"],
                row["course_shortname"]
            ]
            )
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.course);

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
};

module.exports = library;
