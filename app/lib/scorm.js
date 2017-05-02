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
        |    2   |     30 |   572 |              view.php?id=572    |  65  |
        |   183  |     32 |   638 |              view.php?id=638    |  66  |
             |         |       |                               |        |
        mdl_user.id    |       |                               |        |
                mdl_course.id  |                               |        |
                      mdl_course_modules.id                    |        |
                                            mdl_course_modules.id  
                                                                    mdl_scorm.id
        ========
         PASS 1
        ========

        SELECT course,cmid,url FROM `mdl_log` WHERE module='scorm' AND action='add' AND id=49672
        +--------+-------+--------------------------------+
        | course | cmid  | url                            |
        +--------+-------+--------------------------------+
        |    30  | 572   | view.php?id=572                |
        +--------+-------+--------------------------------+

        SELECT course,instance FROM `mdl_course_modules` WHERE  id=572
        +--------+----------+
        | course | instance |
        +--------+----------+
        |    30  |     65   |
        +--------+----------+

        SELECT shortname FROM `mdl_course` WHERE  id=30
        +----------------------+
        | shortname            |
        +----------------------+
        | PMSBConcepts         |
        +----------------------+

        SELECT course,name,reference FROM `mdl_scorm` WHERE  id=65
        +--------+-----------------------------+-------------------+
        | course | name                        | reference         |
        +--------+-----------------------------+-------------------+
        |    30  | PMS Diaries                 | PMS_Diaries.zip   |
        +--------+-----------------------------+-------------------+
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.email, u.username, ' +
                    '       cm.instance AS module_instance, ' +
                    '       s.name AS scorm_name, s.reference AS scorm_reference, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u on u.id = log.userid ' +
                    'JOIN mdl_scorm s on s.id = log.info ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    "WHERE log.module = 'scorm' AND log.action = 'add' AND " + restrict_clause,
        
        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname, ' +
                '       s.id AS scorm_id, s.name AS scorm_name, s.reference AS scorm_reference, ' + 
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid ' +
                'FROM mdl_scorm s ' +
                'JOIN mdl_course c ON c.id=s.course ' +
                'JOIN mdl_user u ON BINARY u.email = ? ' +
                'JOIN mdl_course_modules cm ON cm.course = c.id AND cm.instance = s.id and cm.module = ' +
                    "   (SELECT id from mdl_modules where name = 'scorm') " +
                'WHERE s.name = ? AND s.reference=? AND c.shortname = ?',
                [
                    row["email"],
                    row["scorm_name"],
                    row["scorm_reference"],
                    row["course_shortname"]
                ]
            )
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.username;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/\?id=\d+/, '?id=' + match_row.cmid);
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
                                "'" + match_row.scorm_id + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },    
    "launch": {
        /*
        Same as the add action, this case has to do only one-pass matching because the url contains just the mdl_course_modules.id

        | userid | course |  cmid | url                             | info                                                                                   |
        +--------+--------+-------+---------------------------------+----------------------------------------------------------------------------------------+
        |   530  |    97  | 6106  |              view.php?id=6106   |  http://ecampus.msf.org/moodlemsf/pluginfile.php/9529/mod_scorm/content/0/scormRLO.htm |
        |   1575 |    97  | 6077  |              view.php?id=6077   |  http://ecampus.msf.org/moodlemsf/pluginfile.php/9500/mod_scorm/content/0/scormRLO.htm |
             |         |       |                               |                                                        |
        mdl_user.id    |       |                               |                                                        |
                mdl_course.id  |                               |                                                        |
                        mdl_course_modules.id                  |                                                        |
                                                mdl_course_modules.id                                                   |
                                                                                                                    mdl_context.id
        ========
         PASS 1
        ========

        SELECT course,cmid,url FROM `mdl_log` WHERE module='scorm' AND action='launch' AND id=939182
        +--------+-------+---------------------------------+
        | course | cmid   | url                            |
        +--------+-------+---------------------------------+
        |   97   | 6106   | view.php?id=6106               |
        +--------+-------+---------------------------------+

        SELECT course,instance FROM `mdl_course_modules` WHERE  id=6106
        +--------+----------+
        | course | instance |
        +--------+----------+
        |   97   |   622    |
        +--------+----------+

        SELECT shortname FROM `mdl_course` WHERE  id=97
        +----------------------+
        | shortname            |
        +----------------------+
        | MSFSECUMNGMT08       |
        +----------------------+

        SELECT course,name,reference FROM `mdl_scorm` WHERE  id=622
        +--------+-------------------------------------------------------------+-----------------------------------------------------------------------------------+
        | course | name                                                        | reference                                                                         |
        +--------+-------------------------------------------------------------+-----------------------------------------------------------------------------------+ 
        |    97  | LU 1.1 A2 Context Analysis for Security Management in MSF   | /03_SCORMs/Module_1/LU_1.1_A2_Context_Analysis_for_Security_Management_in_MSF.zip |
        +--------+-------------------------------------------------------------+-----------------------------------------------------------------------------------+


        SELECT contextlevel, instanceid FROM `mdl_context` WHERE id=9529
        +----------------+----------------------------+
        | contextlevel   | instanceid                 |
        +----------------+----------------------------+
        |   70           |    6106                    |  -> mdl_course_modules.id
        +----------------+----------------------------+

        SELECT contextid, component, filearea, itemid, filename FROM `mdl_files` WHERE contextid=9529 AND filename='scormRLO.htm'
        +-----------+-------------+------------+------------+-----------------+
        | contextid | component   | filearea   |    itemid  |  filename       | 
        +-----------+-------------+-------------------------+-----------------+
        |    9529   |  mod_scorm  |  content   |     0      |   scormRLO.htm  |
        +-----------+-------------+------------+------------+-----------------+
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.email, u.username, ' +
                    '       cm.instance AS module_instance, ' +
                    '       s.name AS scorm_name, s.reference AS scorm_reference, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       ct.id AS context_id '+
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u on u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_context ct ON ct.contextlevel = 70 AND ct.instanceid = cm.id ' +
                    'JOIN mdl_scorm s on s.id = cm.instance ' +// in this case(compared to 'add' action) I'm joining by "s.id = cm.instance" because log.info !=s.id
                    // 'JOIN mdl_files f on f.contextid = ct.id AND f.filename =' +
                    "WHERE log.module = 'scorm' AND log.action = 'launch' AND " + restrict_clause,
        
        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname, ' +
                '       s.id AS scorm_id, s.name AS scorm_name, s.reference AS scorm_reference,' + 
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid, ' +
                '       ct.id AS context_id '+
                'FROM mdl_scorm s ' +
                'JOIN mdl_course c ON c.id=s.course ' +
                'JOIN mdl_user u ON BINARY u.email = ? ' +
                'JOIN mdl_course_modules cm ON cm.course = c.id AND cm.instance = s.id and cm.module = ' +
                    "   (SELECT id from mdl_modules where name = 'scorm') " +
                'JOIN mdl_context ct on ct.contextlevel = 70 AND ct.instanceid = cm.id ' +
                'WHERE s.name = ? AND s.reference=? AND c.shortname = ?',
                [
                    row["email"],
                    row["scorm_name"],
                    row["scorm_reference"],
                    row["course_shortname"]
                ]
            )
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.username;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/\?id=\d+/, '?id=' + match_row.cmid);
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
                                "'" + old_row.info.replace(old_row.context_id,match_row.context_id) + "'"//replace the mdl_context.id in the URL
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "delete attempts": {// this action has only 13 entries
        /*
        Same as the add action, this case has to do only one-pass matching because the url contains just the mdl_course_modules.id

        | userid | course |  cmid | url                             | info   |
        +--------+--------+-------+---------------------------------+--------+
        |    2   |    176 | 12388 |            report.php?id=12388  |  28:1  |
        |   1967 |    276 | 22267 |            report.php?id=22267  | 1967:2 | -- 22267 mdl_course_modules is missing (4 out of 6 different mdl_course_modules are missing)
             |         |       |                               |        |
        mdl_user.id    |       |                               |        |
                mdl_course.id  |                               |        |
                      mdl_course_modules.id                    |        |
                                            mdl_course_modules.id       |
                                                                        ?
        ========
         PASS 1
        ========

        SELECT course,cmid,url FROM `mdl_log` WHERE module='scorm' AND action='delete attempts' AND id=49672
        +--------+-------+---------------------------------+
        | course | cmid   | url                            |
        +--------+-------+---------------------------------+
        |   176  | 12388  | view.php?id=12388              |
        +--------+-------+---------------------------------+

        SELECT course,instance FROM `mdl_course_modules` WHERE  id=12388
        +--------+----------+
        | course | instance |
        +--------+----------+
        |   176  |   1060   |
        +--------+----------+

        SELECT shortname FROM `mdl_course` WHERE  id=176
        +----------------------+
        | shortname            |
        +----------------------+
        | INDUCTION09          |
        +----------------------+

        SELECT course,name,reference FROM `mdl_scorm` WHERE  id=1060
        +--------+-------------------------------------------------------------+-----------------------------------------------------------------------------------+
        | course | name                                                        | reference                                                                         |
        +--------+-------------------------------------------------------------+-----------------------------------------------------------------------------------+ 
        |   176  | 1. MSF in the Humanitarian Arena                            | Humanitarian Arena_Questions_Answers.zip                                          |
        +--------+-------------------------------------------------------------+-----------------------------------------------------------------------------------+
        */
        // alias: () => { make_alias(library, 'delete attempts', 'launch') }
        sql_old:    'SELECT log.*, ' +
            '       u.email, u.username, ' +
            '       cm.instance AS module_instance, ' +
            '       s.name AS scorm_name, s.reference AS scorm_reference, ' +
            '       c.shortname AS course_shortname ' +
            'FROM mdl_log log ' +
            'JOIN mdl_user u on u.id = log.userid ' +
            'JOIN mdl_course c ON c.id = log.course ' +
            'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
            'JOIN mdl_scorm s on s.id = cm.instance ' +
            "WHERE log.module = 'scorm' AND log.action = 'launch' AND " + restrict_clause,
        
        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname, ' +
                '       s.id AS scorm_id, s.name AS scorm_name, s.reference AS scorm_reference,' + 
                '       u.id AS userid, u.username, u.email,' +
                '       cm.id AS cmid ' +
                'FROM mdl_scorm s ' +
                'JOIN mdl_course c ON c.id=s.course ' +
                'JOIN mdl_user u ON BINARY u.email = ? ' +
                'JOIN mdl_course_modules cm ON cm.course = c.id AND cm.instance = s.id and cm.module = ' +
                    "   (SELECT id from mdl_modules where name = 'scorm') " +
                'WHERE s.name = ? AND s.reference = ? AND c.shortname = ?',
                [
                    row["email"],
                    row["scorm_name"],
                    row["scorm_reference"],
                    row["course_shortname"]
                ]
            )
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.username;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/\?id=\d+/, '?id=' + match_row.cmid);
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
    "pre-view": {
        /*
        Same as the add action, this case has to do only one-pass matching because the url contains just the mdl_course_modules.id

        | userid | course |  cmid | url                             | info   |
        +--------+--------+-------+---------------------------------+--------+
        |    2   |    18  |  315  |              view.php?id=315    |  13    |
        |    21  |    18  |  315  |              view.php?id=315    |  13    |
             |         |       |                               |        |
        mdl_user.id    |       |                               |        |
                mdl_course.id  |                               |        |
                      mdl_course_modules.id                    |        |
                                            mdl_course_modules.id       |
                                                                    mdl_scorm.id
        ========
         PASS 1
        ========

        SELECT course,cmid,url FROM `mdl_log` WHERE module='scorm' AND action='pre-view' AND id=24780
        +--------+-------+--------------------------------+
        | course | cmid  | url                            |
        +--------+-------+--------------------------------+
        |    18  | 315   | view.php?id=315                |
        +--------+-------+--------------------------------+

        SELECT course,instance FROM `mdl_course_modules` WHERE  id=315
        +--------+----------+
        | course | instance |
        +--------+----------+
        |    18  |     13   |
        +--------+----------+

        SELECT shortname FROM `mdl_course` WHERE  id=18
        +----------------------+
        | shortname            |
        +----------------------+
        | BTJuly 2009          |
        +----------------------+

        SELECT course,name,reference FROM `mdl_scorm` WHERE  id=13
        +--------+---------------------------------+----------------------------------------+
        | course | name                            | reference                              |
        +--------+---------------------------------+----------------------------------------+
        |    18  | Online Communication Principles | /OnlineCommunicationPrinciplesV5.zip   |
        +--------+---------------------------------+----------------------------------------+
        */
        alias: () => { make_alias(library, 'pre-view', 'add') }
    },
    "report": {
        /*
        Same as the add action, this case has to do only one-pass matching because the url contains just the mdl_course_modules.id

        | userid | course |  cmid | url                             | info   |
        +--------+--------+-------+---------------------------------+--------+
        |    48  |    18  |  315  |              view.php?id=315    |  13    |
        |    48  |    18  |  315  |              view.php?id=315    |  13    |
             |         |       |                               |        |
        mdl_user.id    |       |                               |        |
                mdl_course.id  |                               |        |
                      mdl_course_modules.id                    |        |
                                            mdl_course_modules.id       |
                                                                    mdl_scorm.id
        */
        alias: () => { make_alias(library, 'report', 'add') }
    },
    "update": { 
        alias: () => { make_alias(library, 'update', 'add') }
    },
    "userreport": {
        alias: () => { make_alias(library, 'userreport', 'add') }
    },
    "view": {
        /*
        This case has to do two-pass matching to extract the scoid from the url and
        then query mdl_scorm_scoers:

        | userid | course |  cmid | url                             | info |
        +--------+--------+-------+---------------------------------+------+
        |      2 |     18 |   315 | player.php?id=315&scoid=26      | 13   |
        |   3118 |    274 | 24161 | player.php?cm=24161&scoid=9879  | 2216 |
             |         |       |                               |        |
        mdl_user.id    |       |                               |        |
                mdl_course.id  |                               |        |
                      mdl_course_modules.id                    |        |
                                                    mdl_scorm_scoes.id  |
                                                                    mdl_scorm.id

        This case doesn't need pass 2, but needs different matching:

        | userid | course |  cmid | url                             | info |
        +--------+--------+-------+---------------------------------+------+
        |   1808 |    274 | 24161 | player.php?cm=24161&scoid=      | 2216 | (Broken, can't fix)

        ========
         PASS 1
        ========

        select course,cmid,url from mdl_log where module='scorm' and action='view' and id=2157709;
        +--------+-------+--------------------------------+
        | course | cmid  | url                            |
        +--------+-------+--------------------------------+
        |    274 | 24161 | player.php?cm=24161&scoid=9879 |
        +--------+-------+--------------------------------+

        select course,instance from mdl_course_modules where id=24161;
        +--------+----------+
        | course | instance |
        +--------+----------+
        |    274 |     2216 |
        +--------+----------+

        select shortname from mdl_course where id=274;
        +----------------------+
        | shortname            |
        +----------------------+
        | PPD_FirstQuarter2015 |
        +----------------------+

        select course,name,reference from mdl_scorm where id=2216;
        +--------+-----------------------------+-------------------+
        | course | name                        | reference         |
        +--------+-----------------------------+-------------------+
        |    274 | The Phases of Project Cycle | Project Cycle.zip |
        +--------+-----------------------------+-------------------+

        ========
         PASS 2
        ========

        select scorm,identifier,title from mdl_scorm_scoes where id=9879;
        +-------+----------------------------------+------------------------------+
        | scorm | identifier                       | title                        |
        +-------+----------------------------------+------------------------------+
        |  2216 | The_Phases_of_Project_Cycle__SCO | The Phases of Project Cycle  |
        +-------+----------------------------------+------------------------------+

        ============================
         REVERSE MATCH (with scoid)
        ============================

        select  c.shortname, o.id as sco_id, o.scorm as sco_scorm, o.identifier as
                sco_ident, s.name as scorm_name, s.reference as scorm_ref, s.course
                as scorm_course from mdl_scorm_scoes o join mdl_scorm s on s.id=o.scorm
                join mdl_course c on c.id=s.course where o.title='The Phases of
                Project Cycle' and o.identifier='The_Phases_of_Project_Cycle__SCO'
                and c.shortname='PPD_FirstQuarter2015';

        +----------------------+--------+-----------+----------------------------------+...
        | shortname            | sco_id | sco_scorm | sco_ident                        |...
        +----------------------+--------+-----------+----------------------------------+...
        | PPD_FirstQuarter2015 |   9879 |      2216 | The_Phases_of_Project_Cycle__SCO |...

                                    ...+-----------------------------+-------------------+--------------+
                                    ...| scorm_name                  | scorm_ref         | scorm_course |
                                    ...+-----------------------------+-------------------+--------------+
                                    ...| The Phases of Project Cycle | Project Cycle.zip |          274 |

        app_1           |   mdl_log.scorm.view.count: 31043
        app_1           |   mdl_log.scorm.view.multiple_matches: 325
        app_1           |   mdl_log.scorm.view.multiple_matches_fixed: 325
        app_1           |   mdl_log.scorm.view.no_matches: 10
        app_1           |   mdl_log.scorm.view.no_matches_p2: 15755
        app_1           |   mdl_log.scorm.view.time: 78279ms

        app_1           |   mdl_log.scorm.view.count: 15278
        app_1           |   mdl_log.scorm.view.multiple_matches: 325
        app_1           |   mdl_log.scorm.view.multiple_matches_fixed: 325
        app_1           |   mdl_log.scorm.view.time: 64329ms

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.email, u.username, ' +
                    '       s.name AS scorm_name, s.reference AS scorm_reference, ' +
                    '       o.id AS sco_id, ' +
                    '       o.identifier AS sco_identifier, ' +
                    '       o.title AS sco_title, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_scorm s ON s.id = log.cmid ' +
                    "LEFT JOIN mdl_scorm_scoes o ON o.id = " +
                    "       (select reverse(" +
                    "           substr(" +
                    "               reverse(log.url)," +
                    "               1," +
                    "               locate('=', reverse(log.url))-1" +
                    "           )" +
                    "       )) " +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'scorm' AND log.action = 'view' AND " + restrict_clause,

        sql_match:  (row) => {
            return row.sco_title ?
                    mysql.format(
                        'SELECT c.id AS course, c.shortname AS course_shortname ' +
                        '       o.id AS sco_id, o.title AS sco_title, o.identifier AS sco_identifier, ' +
                        '       s.id AS scorm_id, s.name AS scorm_name, s.reference AS scorm_reference,' + 
                        '       cm.id AS cmid, ' +
                        '       u.id AS userid, u.username, u.email ' +
                        'FROM mdl_scorm_scoes o ' +
                        'JOIN mdl_scorm s ON s.id = o.scorm ' +
                        'JOIN mdl_course c ON c.id=s.course ' +
                        'JOIN mdl_course_modules cm ON cm.instance=s.id AND cm.course=c.id ' +
                        'JOIN mdl_user u ON BINARY u.email = ? ' +
                        'WHERE o.title = ? AND o.identifier=? AND c.shortname = ?',
                        [
                            row["email"],
                            row["sco_title"],
                            row["sco_identifier"],
                            row["course_shortname"]
                        ]
                    )
                    :
                    mysql.format(
                        'SELECT c.id AS course, ' +
                        '       s.id AS scorm_id, ' +
                        '       cm.id AS cmid, ' +
                        '       u.id AS userid, u.username ' +
                        'FROM mdl_course c ' +
                        'JOIN mdl_scorm s ON s.name = ? and s.course=c.id ' +
                        'JOIN mdl_course_modules cm ON cm.instance=s.id AND cm.course=c.id ' +
                        'JOIN mdl_user u ON BINARY u.email = ? ' +
                        'WHERE c.shortname = ?',
                        [
                            row["scorm_name"],
                            row["email"],
                            row["course_shortname"]
                        ]
                    );
        },

        match_failed_because_of_known_bad_data: (row) => {
            return row.course_shortname === 'PMSBConcepts';
        },

        format: {
            'no_matches': (row) => {
                return 'no matches for course="' + row.course_shortname +
                                    '", user="' + row.username +
                                    '", sco="' + row.sco_title +
                                    '", scorm="' + row.scorm_name + '"';
            }
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.username;
            });
        },

        fn: function(old_row, match_row, next){
            match_row.sco_id = match_row.sco_id || '';
            var updated_url = old_row.url
                                .replace(/\?id=\d+/, '?id=' + match_row.cmid)
                                .replace(/cm=\d+/, 'cm=' + match_row.cmid)
                                .replace(/scoid=\d+/, 'scoid=' + match_row.sco_id);
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
                                "'" + match_row.scorm_id + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }


    },
    "view all": {
        /*
        Same as the add action, this case has to do only one-pass matching because the url contains just the mdl_course.id 

        | userid | course |  cmid | url                             | info   |
        +--------+--------+-------+---------------------------------+--------+
        |    48  |    18  |    0  |              index.php?id=18    |        |
        |    73  |    30  |    0  |              index.php?id=30    |        |
             |         |       |                               |        
        mdl_user.id    |       |                               |        
                mdl_course.id  |                               |        
                    no mdl_course_modules.id                   |       
                                                        mdl_course.id                              
        */
        sql_old:    'SELECT log.*, ' +
            '       u.email, u.username, ' +
            '       c.shortname AS course_shortname ' +
            'FROM mdl_log log ' +
            'JOIN mdl_user u on u.id = log.userid ' +
            'JOIN mdl_course c ON c.id = log.course ' +
            "WHERE log.module = 'scorm' AND log.action = 'view all' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname' +
                '       u.id AS userid, u.username, u.email ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON BINARY u.email = ? ' +
                'WHERE c.shortname = ?',
                [
                    row["email"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.username;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/\?id=\d+/, '?id=' + match_row.course);
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
                                "'" + match_row.course + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    }
};

module.exports = library;
