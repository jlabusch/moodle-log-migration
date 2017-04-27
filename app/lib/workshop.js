var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
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
        info --> mdl_workshop.id & mdl_course_modules.instance 

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       w.name AS workshop_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_workshop w ON w.id = cm.instance and w.course = log.course ' +
                    "WHERE log.module = 'workshop' AND log.action = 'add' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid, ' +
                '       w.id AS workshopid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_workshop w ON w.course = c.id AND BINARY w.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = w.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'workshop') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["email"],
                    row["workshop_name"],
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
            var updated_url = old_row.url.replace(/id=\d+/, 'id=' + match_row.cmid);
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
                                "'" + match_row.workshopid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "add assessment": {        
        /*
        +--------+--------+-------+-------------------------+------+
        | userid | course | cmid  | url                     | info |
        +--------+--------+-------+-------------------------+------+
        | 1832   | 176    | 12164 | assessment.php?asid=139 | 33   |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> assessment.php?asid=139 -- refers to mdl_worshop_assessments.id
        info --> mdl_workshop_submissions.id 
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       w.name AS workshop_name, ' +
                    '       ws.timecreated AS submission_time, ws.title AS submission_title, ' +
                    '       wa.timecreated AS assessement_time ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_workshop w ON w.id = cm.instance and w.course = c.id ' +
                    'JOIN mdl_workshop_submissions ws ON ws.id = log.info AND ws.workshopid = w.id ' +
                    'JOIN mdl_workshop_assessments wa ON wa.id = SUBSTRING(log.url FROM (LOCATE("asid=", log.url) + 5)) AND wa.submissionid = ws.id ' +
                    "WHERE log.module = 'workshop' AND log.action = 'add assessment' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid, ' +
                '       wa.id AS assessmentid, ' +
                '       ws.id AS submissionid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_workshop w ON w.course = c.id AND BINARY w.name = ? ' +
                'JOIN mdl_workshop_submissions ws ON ws.workshopid = w.id AND ws.timecreated = ? AND BINARY ws.title = ? ' +
                'JOIN mdl_workshop_assessments wa ON wa.submissionid = ws.id AND wa.timecreated = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = w.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'workshop') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["email"],
                    row["workshop_name"],
                    row["submission_time"],
                    row["submission_title"],
                    row["assessement_time"],
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
            var updated_url = old_row.url.replace(/asid=\d+/, 'asid=' + match_row.assessmentid);
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
                                "'" + match_row.submissionid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "add example": {        
        /*
        +--------+--------+-------+----------------------------------+------+
        | userid | course | cmid  | url                              | info |
        +--------+--------+-------+----------------------------------+------+
        | 48     | 176    | 12164 | exsubmission.php?cmid=12164&id=5 | 5    |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> exsubmission.php?cmid=12164&id=5 -- cmid refers to mdl_course_modules.id, id refers to mdl_worshop_submissions.id
        info --> mdl_workshop_submissions.id 
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       w.name AS workshop_name, ' +
                    '       ws.timecreated AS submission_time, ws.title AS submission_title ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_workshop w ON w.id = cm.instance and w.course = c.id ' +
                    'JOIN mdl_workshop_submissions ws ON ws.id = log.info AND ws.workshopid = w.id ' +
                    "WHERE log.module = 'workshop' AND log.action = 'add example' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid, ' +
                '       ws.id AS submissionid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_workshop w ON w.course = c.id AND BINARY w.name = ? ' +
                'JOIN mdl_workshop_submissions ws ON ws.workshopid = w.id AND ws.timecreated = ? AND BINARY ws.title = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = w.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'workshop') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["email"],
                    row["workshop_name"],
                    row["submission_time"],
                    row["submission_title"],
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
            var updated_url = old_row.url.replace(/cmid=\d+/, 'cmid=' + match_row.cmid)
                                         .replace(/\&id=\d+/, '\&id=' + match_row.submissionid);
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
                                "'" + match_row.submissionid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "add example assessment": { 
        alias: () => { make_alias(library, 'add example assessment', 'add assessment') }
    },
    "add reference assessment": { 
        alias: () => { make_alias(library, 'add reference assessment', 'add assessment') }
    },
    "add submission": { 
        alias: () => { make_alias(library, 'add submission', 'add example') }
    },
    "submit": {
        alias: () => { make_alias(library, 'submit', 'add') }
    },
    "update": {
        alias: () => { make_alias(library, 'update', 'add') }
    },
    "update aggregate grades": {
        alias: () => { make_alias(library, 'update aggregate grades', 'add') }
    },
    "update assessment": {
        alias: () => { make_alias(library, 'update assessment', 'add assessment') }
    },
    "update example": {
        alias: () => { make_alias(library, 'update example', 'add example') }
    },
    "update example assessment": {
        alias: () => { make_alias(library, 'update example assessment', 'add assessment') }
    },
    "update submission": {
        alias: () => { make_alias(library, 'update submission', 'add example') }
    },
    "update switch phase": {
        alias: () => { make_alias(library, 'update switch phase', 'add') }
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
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'workshop' AND log.action = 'view all' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
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
    "view example": {
        alias: () => { make_alias(library, 'view example', 'add example') }
    },
    "view submission": {
        alias: () => { make_alias(library, 'view submission', 'add example') }
    }
}

module.exports = library;


