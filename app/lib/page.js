var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "add": {
        /*
        This case has to do only one-pass matching because the url contains just the mdl_course_modules.id

        | userid | course |  cmid | url                             | info |
        +--------+--------+-------+---------------------------------+------+
        |  1443  |     1  |  9964 |              view.php?id=9964   |  384 |
        |   445  |    137 |  9974 |              view.php?id=9974   |  389 |
             |         |       |                               |        |
        mdl_user.id    |       |                               |        |
                mdl_course.id  |                               |        |
                      mdl_course_modules.id                    |        |
                                            mdl_course_modules.id  		|
                                                                    mdl_page.id 
        ========
         PASS 1
        ========
        SELECT course,cmid,url FROM `mdl_log` WHERE module='resource' AND action='add' AND id=941774
        +--------+-------+--------------------------------+
        | course | cmid  | url                            |
        +--------+-------+--------------------------------+
        |  1443  |    1  |        view.php?id=9964        |
        +--------+-------+--------------------------------+

        SELECT course,instance FROM `mdl_course_modules` WHERE  id=9964
        +--------+----------+
        | course | instance |
        +--------+----------+
        |    1   |     384  |  --> mdl_page.id
        +--------+----------+

        SELECT shortname FROM `mdl_course` WHERE  id=1
        +----------------------+
        | shortname            |
        +----------------------+
        | MSF e-Campus         |
        +----------------------+

        SELECT course,name FROM `mdl_page` WHERE  id=384
        +--------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
        | course | name                                                                                                                                                                          |
        +--------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
        |    1   | <span lang="en" class="multilang">Learning Info</span><span lang="es_es" class="multilang">Learning info</span><span lang="fr" class="multilang">Info d'apprentissage</span>  | 
        +--------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
        */	
        sql_old:    'SELECT log.*, ' +
            '       u.username, u.email, ' +
            '       cm.instance AS module_instance, ' +
            '       p.id AS page_id, p.name AS page_name, ' +
            '       c.shortname AS course_shortname ' +
            'FROM mdl_log log ' +
            'JOIN mdl_user u on u.id = log.userid ' +
            'JOIN mdl_course c ON c.id = log.course ' +
            'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
            'LEFT JOIN mdl_page p on p.id = log.info ' +
            "WHERE log.module = 'page' AND log.action = 'add' AND " + restrict_clause,
              
        sql_match:  (row) => {
            return mysql.format(
                    'SELECT c.id AS course, c.shortname AS course_shortname, ' +
                    '       p.id AS page_id, p.name AS page_name, ' + 
                    '       u.id AS userid, u.username, u.email, ' +
                    '       cm.id AS cmid, cm.instance AS module_instance ' +
                    'FROM mdl_course c ' +
                    'JOIN mdl_user u ON (u.username = ? OR u.email = ? ) ' +
                    'LEFT JOIN mdl_page p ON p.course = c.id AND p.name = ? ' +
                    'JOIN mdl_course_modules cm ON cm.course = c.id AND cm.instance = p.id and cm.module = ' +
                        "   (SELECT id from mdl_modules where name = 'page') " +
                    'WHERE c.shortname = ? ',
                [
                    row["username"],
                    row["email"],
                    row["page_name"],
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
                                match_row.cmid,
                                "'" + old_row.action + "'",
                                "'" + updated_url + "'",
                                "'" + match_row.page_id + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "update": {
		/*
        This case has to do only one-pass matching because the url contains just the mdl_course_modules.id

        | userid | course |  cmid | url                             | info |
        +--------+--------+-------+---------------------------------+------+
        |   445  |    137 |  9974 |              view.php?id=9974   |  389 |
        |  1581  |    140 | 10009 |              view.php?id=10009  |  395 |
             |         |       |                               |        |
        mdl_user.id    |       |                               |        |
                mdl_course.id  |                               |        |
                      mdl_course_modules.id                    |        |
                                            mdl_course_modules.id  		|
                                                                    mdl_page.id 
        ========
         PASS 1
        ========
        SELECT course,cmid,url FROM `mdl_log` WHERE module='resource' AND action='update' AND id=942081
        +--------+-------+--------------------------------+
        | course | cmid  | url                            |
        +--------+-------+--------------------------------+
        |   445  |  9974 |   view.php?id=9974             |
        +--------+-------+--------------------------------+

        SELECT course,instance FROM `mdl_course_modules` WHERE  id=9974
        +--------+----------+
        | course | instance |
        +--------+----------+
        |   137  |    389   | --> mdl_resource.id
        +--------+----------+

        SELECT shortname FROM `mdl_course` WHERE  id=137
        +----------------------+
        | shortname            |
        +----------------------+
        | PMSinMSF             |
        +----------------------+

        SELECT course,name FROM `mdl_page` WHERE  id=389
        +--------+------------------------------------------------------+
        | course | name                                                 |
        +--------+------------------------------------------------------+
        |    18  | 1. The importance of persons to the mission of MSF   | 
        +--------+------------------------------------------------------+
        */
        alias: () => { make_alias(library, 'update', 'add') }
    },
    "view": {
        alias: () => { make_alias(library, 'view', 'add') }
    },
    "view all": {
        /*      
        This case has to do only one-pass matching because the url contains just the mdl_course_modules.id

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
                    'SELECT c.id AS course, c.shortname AS course_shortname, ' +
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
