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
        |    48  |     18 |   316 |              view.php?id=316    |  39  |
        |    48  |     18 |   311 |              view.php?id=311    |  38  |
             |         |       |                               |        |
        mdl_user.id    |       |                               |        |
                mdl_course.id  |                               |        |
                      mdl_course_modules.id                    |        |
                                            mdl_course_modules.id  	|
                                                                    mdl_resource.id 
        ========
         PASS 1
        ========
        SELECT course,cmid,url FROM `mdl_log` WHERE module='resource' AND action='add' AND id=20061
        +--------+-------+--------------------------------+
        | course | cmid  | url                            |
        +--------+-------+--------------------------------+
        |    48  | 316   | view.php?id=316                |
        +--------+-------+--------------------------------+

        SELECT course,instance FROM `mdl_course_modules` WHERE  id=572
        +--------+----------+
        | course | instance |
        +--------+----------+
        |    18  |     39   |  --> mdl_resource.id
        +--------+----------+

        SELECT shortname FROM `mdl_course` WHERE  id=18
        +----------------------+
        | shortname            |
        +----------------------+
        | BTJuly 2009          |
        +----------------------+

        SELECT course,name FROM `mdl_resource` WHERE  id=39
        +--------+-----------------------------+
        | course | name                        |
        |    18  | Online tutor principles     | 
        +--------+-----------------------------+
        */	
        alias: () => { make_alias(library, 'add', 'update') }
    },
    "update": {
		/*
        This case has to do only one-pass matching because the url contains just the mdl_course_modules.id

        | userid | course |  cmid | url                             | info |
        +--------+--------+-------+---------------------------------+------+
        |    48  |     18 |   316 |              view.php?id=316    |  39  |
        |    48  |     18 |   324 |              view.php?id=324    |  41  |
             |         |       |                               |        |
        mdl_user.id    |       |                               |        |
                mdl_course.id  |                               |        |
                      mdl_course_modules.id                    |        |
                                            mdl_course_modules.id  	|
                                                                    mdl_resource.id 
        ========
         PASS 1
        ========
        SELECT course,cmid,url FROM `mdl_log` WHERE module='resource' AND action='add' AND id=23601
        +--------+-------+--------------------------------+
        | course | cmid  | url                            |
        +--------+-------+--------------------------------+
        |    48  | 316   | view.php?id=316                |
        +--------+-------+--------------------------------+

        SELECT course,instance FROM `mdl_course_modules` WHERE  id=321
        +--------+----------+
        | course | instance |
        +--------+----------+
        |    18  |     39   | --> mdl_resource.id
        +--------+----------+

        SELECT shortname FROM `mdl_course` WHERE  id=18
        +----------------------+
        | shortname            |
        +----------------------+
        | BTJuly 2009          |
        +----------------------+

        SELECT course,name FROM `mdl_resource` WHERE  id=39
        +--------+-----------------------------+
        | course | name                        |
        +--------+-----------------------------+
        |    18  | Online tutor principles     | 
        +--------+-----------------------------+
        */
        sql_old:    'SELECT log.*, r.id AS resource_id, ' +
                    '       u.username, u.email, ' +
                    '       r.name AS resource_name, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u on u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'LEFT JOIN mdl_resource r on r.id = log.info AND r.id = cm.instance ' +
                    "WHERE log.module = 'resource' AND log.action = 'update' AND " + restrict_clause,
        
        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       r.id AS resource_id, r.name AS resource_name, ' + 
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid ' +
                'FROM mdl_course c ' +
                'LEFT JOIN mdl_resource r ON r.course = c.id ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ? ) ' +
                'LEFT JOIN mdl_course_modules cm ON cm.course = c.id AND cm.module = ' +
                    "   (SELECT id from mdl_modules where name = 'resource') " +
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
            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cmid);

            var updated_cm = (match_row.cmid != null) ? match_row.cmid : "course module "+ old_row.cmid +" not found";

            var updated_info = (old_row.resource_id != null && old_row.resource_name == match_row.resource_name) ? match_row.resource_id : "resource "+old_row.info+" not found";

            var output ='INSERT INTO mdl_log ' +
                        '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                        '(' +
                            [
                                old_row.time,
                                match_row.userid,
                                "'" + old_row.ip + "'",
                                match_row.course,
                                "'" + old_row.module + "'",
                                updated_cm,
                                "'" + old_row.action + "'",
                                "'" + updated_url + "'",
                                "'" + updated_info + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "view": {
        /*
        This case has to do only one-pass matching because the url contains just the mdl_course_modules.id

        | userid | course |  cmid | url                             | info |
        +--------+--------+-------+---------------------------------+------+
        |    48  |     18 |   321 |              view.php?id=321    |  40  |
        |    48  |     18 |   311 |              view.php?id=311    |  38  |
             |         |       |                               |        |
        mdl_user.id    |       |                               |        |
                mdl_course.id  |                               |        |
                      mdl_course_modules.id                    |        |
                                            mdl_course_modules.id       |
                                                                    mdl_resource.id 
        */
        alias: () => { make_alias(library, 'view', 'update') }
    },
    "view all": {
        /*      
        This case has to do only one-pass matching because the url contains just the mdl_course_modules.id

        | userid | course |  cmid | url                             | info |
        +--------+--------+-------+---------------------------------+------+
        |    48  |     18 |    0  |              view.php?id=18     |      |
        |    48  |     18 |    0  |              view.php?id=18     |      |
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
                    "WHERE log.module = 'resource' AND log.action = 'view all' AND " + restrict_clause,
        
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
    },
};

module.exports = library;
