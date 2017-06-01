var restrict_clause = require('./sql_restrictions.js')(),
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "upload": {
        /*
        +--------+--------+------+-----------------------------------------------------------------------------------+----------------------------------------------+
        | userid | course | cmid | url                                                                               | info                                         |
        +--------+--------+------+-----------------------------------------------------------------------------------+----------------------------------------------+
        |      2 |      1 |   0  | http://ecampus.msf.org/moodlemsf/lib/editor/htmlarea/popups/insert_image.php?id=1 | D:\moodledatas/moodledatamsf/1/introMSF.swf  |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname) [course=0 933 rows, course=1 445 rows, 9968 rows with different course ids]
        cmid --> always 0
        url --> empty [954 rows]
        url --> different urls [10392 rows] 6001 with ids
            --> http://ecampus.msf.org/moodlemsf/files/index.php?choose=&id=1&wdir=%2F&action=upload [1738 rows] --- id refers to course id
            --> http://ecampus.msf.org/moodlemsf/lib/editor/htmlarea/popups/insert_image.php?id=1 [393 rows] --- id refers to course id
            --> http://ecampus.msf.org/moodlemsf/mod/assignment/submissions.php?id=1868&userid=187&mode=single&of [3481 rows]  --- userid does not match log.userid
            --> http://ecampus.msf.org/moodlemsf/user/edit.php?id=1008&course=1 [388 rows] --- id refers to user.id (matches log.userid), course (matches log.course)
            --> http://ecampus.msf.org/moodlemsf/blog/edit.php?action=add&courseid=96 [1 row] --- courseid does not match log.course 

        info --> 'D:\moodledatas/moodledatamsf/1/introMSF.swf' [different file paths] 
        */
        sql_old:    'SELECT log.*, ' +
                    '       (log.url like "%id=%") AS hasid, (SUBSTRING(log.url FROM LOCATE("courseid", log.url)+ 9) > 0 ) as hascourseid, ' +
                    '       (log.url like "%user/%") AS idisuserid, (log.url like "%assignment%") AS notmigrated,' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       c1.shortname AS target_course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'LEFT JOIN mdl_course c1 ON c1.id = SUBSTRING(log.url FROM LOCATE("courseid", log.url)+ 9) ' +
                    "WHERE log.module = 'upload' AND log.action = 'upload' AND " + restrict_clause,

        sql_match:  (row) => {
            if (row.hasid == false) {          
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
            } else {
                if (row.hascourseid == false) {                   
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
                } else {   
                    return mysql.format(
                        'SELECT c.id AS course, c.shortname AS course_shortname, c1.id AS target_course, c1.shortname AS target_course_shortname,  ' +
                        '       u.id AS userid, u.username, u.email ' +
                        'FROM mdl_course c ' +
                        'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                        'JOIN mdl_course c1 ON c1.shortname = ? ' +
                        'WHERE c.shortname = ?',
                        [
                            row["username"],
                            row["email"],
                            row["target_course_shortname"],
                            row["course_shortname"]
                        ]
                    );
                }
            }
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url;
            if(old_row.hasid == false) {
                updated_url = old_row.url;
            } else {
                if (old_row.idisuserid == false) {
                    if(old_row.hascourseid == false) {
                        if(old_row.notmigrated == true) {
                            updated_url = old_row.url + '#ids_not_migrated';
                        } else {                            
                            updated_url = old_row.url
                                .replace(/id=\d+/, 'id=' + match_row.course)
                        }
                    } else {                    
                        updated_url = old_row.url
                            .replace(/courseid=\d+/, 'courseid=' + match_row.target_course);
                    }
                } else {
                    updated_url = old_row.url
                        .replace(/id=\d+/, 'id=' + match_row.userid)
                        .replace(/course=\d+/, 'course=' + match_row.course);
                }
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


