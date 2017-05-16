var fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

// ('foo', ['email']) => "'email' AS __foo_field_0, mdl_foo.email AS __foo_value_0"
function format_attr(table, fields){
    return fields.map((x, i) => {
        x = x.replace(/:.*/, '');
        return `'${x}' AS __${table}_field_${i}, mdl_${table}.${x} AS __${table}_value_${i}`;
    }).join(',');
}

function format_attr_any(table, fields){
    if (fields.length < 1){
        return '';
    }
    return format_attr(table, fields) + `, 'OR' AS __${table}_operator`;
}

function format_attr_all(table, fields){
    if (fields.length < 1){
        return '';
    }
    return format_attr(table, fields) + `, 'AND' AS __${table}_operator`;
}

function select_and_split_attr(table, x){
    let result = [];
    defining_attributes(table).forEach((attr) => {
        let parts = attr.split(':');
        if (parts[0] === x){
            result = parts;
        }
    });
    return result;
}

// Columns that can uniquely identify a table during sql_match()
function defining_attributes(table){
    switch(table){
        case 'book_chapters':   return ['bookid:mdl_book.id', 'title'];
        case 'blog_association':   return ['blogid:mdl_post.id'];
        case 'block_admin_presets':   return ['name', 'timecreated', 'userid:u.id'];
        case 'chat_messages':   return ['chatid:mdl_chat.id', 'message', 'timestamp'];
        case 'course': return ['shortname'];
        case 'course_categories': return ['name'];
        case 'course_completions':        return ['course:c.id', 'timeenrolled', 'userid:r.id'];
        case 'course_modules': return ['course:c.id', 'added'];
        case 'course_modules_completion': return ['timemodified', 'userid:u.id'];
        case 'course_sections': return ['course:c.id', 'section'];
        case 'feedback_completed': return ['feedback:mdl_feedback.id', 'userid:u.id'];
        case 'groups': return ['timecreated', 'name', 'courseid:c.id'];
        case 'groupings': return ['timecreated', 'name', 'courseid:c.id'];
        case 'lti': return ['timecreated', 'name', 'course:c.id'];
        case 'message_read': return ['timecreated', 'useridfrom:r.id', 'useridto:u.id'];
        case 'message_contacts': return ['userid:u.id', 'contactid:r.id'];
        case 'post': return ['created', 'subject', 'userid:u.id', 'courseid:c.id'];
        case 'tag': return ['name', 'userid:u.id'];
        case 'tag_instance': return ['timecreated', 'tagid:mdl_tag.id'];
        case 'user_enrolments': return ['timecreated', 'userid:r.id'];
        case 'user':                return ['email', 'username'];
        case 'quiz':                return ['name'];
        case 'quiz_attempts':       return ['userid:u.id', 'quiz:mdl_quiz.id'];
        case 'scorm_scoes':         return ['scorm:mdl_scorm.id', 'title', 'identifier'];
        case 'scorm':               return ['course:c.id', 'name', 'reference'];
        case 'assign':              return ['course:c.id', 'name'];
        case 'assign_grades':       return ['userid:r.id', 'grader:u.id', 'assignment:mdl_assign.id'];
        case 'assign_submission':   return ['userid:u.id', 'assignment:mdl_assign.id'];
        case 'folder':              return ['course:c.id', 'name'];
        case 'workshop':            return ['course:c.id', 'name'];
        case 'url':                 return ['course:c.id', 'name'];
        case 'simplecertificate':   return ['course:c.id', 'name', 'certificateimage', 'secondimage'];
        case 'resource':            return ['course:c.id', 'name'];
        case 'glossary':            return ['course:c.id', 'name'];
        case 'glossary_entries':    return ['glossaryid:mdl_glossary.id', 'concept'];
        case 'glossary_categories': return ['glossaryid:mdl_glossary.id', 'name'];
        case 'forum':               return ['course:c.id', 'name','type'];
        case 'forum_discussions':   return ['course:c.id', 'forum:mdl_forum.id', 'name'];
        case 'lesson':              return ['course:c.id', 'name'];
        case 'feedback':            return ['course:c.id', 'name'];
        case 'chat':                return ['course:c.id', 'name'];
        case 'book':                return ['course:c.id', 'name'];
        case 'bigbluebuttonbn':     return ['course:c.id', 'name'];
        case 'choice':              return ['course:c.id', 'name'];
        case 'mediagallery':        return ['course:c.id', 'name', 'userid:u.id'];
        case 'wiki':                return ['course:c.id', 'name'];
        case 'workshop_submissions':return ['workshopid:mdl_workshop.id', 'title', 'authorid:r.id'];//relateduserid
        case 'mediagallery_gallery':return ['instanceid:mdl_mediagallery.id','name'];
        case 'imscp':               return ['course:c.id', 'name'];
        case 'comments':            return ['userid:u.id', 'timecreated'];
        case 'forum_posts':         return ['userid:u.id', 'subject', 'created'];
        case 'mediagallery_item':   return ['userid:u.id', 'caption', 'timecreated'];
        case 'wiki_pages':          return ['title', 'timecreated'];
        case 'wiki_versions':       return ['content', 'timecreated'];
        case 'question':            return ['name','questiontext', 'timecreated'];
        case 'certificate':         return ['name', 'timecreated'];
    }
    return [];
}

// Tables that need to be joined in by following the chain from
// mdl_logstore_standard_log.contextinstanceid -> mdl_course_modules.id,
// mdl_course_modules.instance -> $table.id
function linked_table(table){
    let link = null;
    switch(table){
        case 'book_chapters':     link = 'book'; break;
        case 'chat_messages':     link = 'chat'; break;
        case 'feedback_completed':     link = 'feedback'; break;
        case 'scorm_scoes':         link = 'scorm'; break;
        case 'quiz_attempts':       link = 'quiz'; break;
        case 'quiz':                break;
        case 'page':                break;
        case 'grade_grades':        break;
        case 'forum_discussions':   link = 'forum'; break;
        case 'glossary_entries':    link = 'glossary'; break;
        case 'glossary_categories': link = 'glossary'; break;
        case 'assign_grades':       link = 'assign'; break;
        case 'assign_submission':   link = 'assign'; break;
        case 'workshop_submissions':link = 'workshop'; break;
        case 'mediagallery_gallery':link = 'mediagallery';break;
    }
    if (link && defining_attributes(link).length > 0){
        return link;
    }
    return null;
}

function special_table(table){
    let s = false;
    switch(table){
        case 'blog_association': s = true; break;
        case 'block_admin_presets': s = true; break;
        case 'cohort': s = true; break;
        case 'message_read': s = true; break;
        case 'message_contacts': s = true; break;
        case 'tag': s = true; break;
        case 'tag_instance': s = true; break;
    }    
    return s;
}

function special_linked_table(table){
    let link = null;
    switch(table){
        case 'blog_association': link = 'post'; break;
    }    
    return link;
}

function special_join(table){
    let table_fields = defining_attributes(table);
    let sql = '';
    table_fields.map((x, i) => {
        let p = x.split(':');
        if(p.length > 1) {
            let m = p[1].split('.');
            let alias = m[0];
            sql += `LEFT JOIN ${m[0]} ${alias} ON ${alias}.${m[1]}=mdl_${table}.${p[0]} `;
        }
    });
    return sql;
}

function no_object_table(row){
    return !row.objecttable || row.objecttable === 'NULL';
}

module.exports = function(module, action){
    if (!action){
        return true;
    }
    let invalid_users = require('./invalid_users').join(',');
    if (module == 'role' || module == 'assignsubmission_file' || module == null) {
        var logstore ;
        if (module == 'role'){
            logstore = require('./role_logstore');
        }
        if (module == 'assignsubmission_file'){
            logstore = require('./assignsubmission_file_logstore');
        }
        if (module == null){
            logstore = require('./null_logstore');
        }
        let x =  logstore[action];
        if (x && x.alias){
            x.alias();
        }
        return x;
    }
    return {
        // +---------+---------------------------+-----------+----------+--------+-------------+----------+------+----------+-----------+--------------+-------------------+--------+----------+---------------+-----------+------------------------------------------------+-------------+--------+---------------+------------+
        // | id      | eventname                 | component | action   | target | objecttable | objectid | crud | edulevel | contextid | contextlevel | contextinstanceid | userid | courseid | relateduserid | anonymous | other                                          | timecreated | origin | ip            | realuserid |
        // +---------+---------------------------+-----------+----------+--------+-------------+----------+------+----------+-----------+--------------+-------------------+--------+----------+---------------+-----------+------------------------------------------------+-------------+--------+---------------+------------+
        // | 3353434 | \core\event\user_loggedin | core      | loggedin | user   | user        |     1666 | r    |        0 |         1 |           10 |                 0 |   1666 |        0 |          NULL |         0 | a:1:{s:8:"username";s:17:"nagioscheckeveris";} |  1489391475 | web    | 176.34.113.55 |       NULL |
        // +---------+---------------------------+-----------+----------+--------+-------------+----------+------+----------+-----------+--------------+-------------------+--------+----------+---------------+-----------+------------------------------------------------+-------------+--------+---------------+------------+
        //
        // mdl_${objecttable}.id == ${objectid} and needs defining_attributes()
        // ${contextid} == mdl_context.id
        // ${contextinstanceid} == mdl_course_modules.id
        // mdl_course_modules.instance == ${X}.id and needs defining_attributes()

        sql_old: `
            SELECT  log.*,
                    u.username AS pri_username, u.email AS pri_email,
                    r.username AS rel_username, r.email AS rel_email,
                    a.username AS real_username, a.email AS real_email,
                    c.shortname AS course_shortname
            FROM mdl_logstore_standard_log log
            LEFT JOIN mdl_course c ON c.id=log.courseid
            JOIN mdl_user u ON u.id=log.userid
            LEFT JOIN mdl_user r ON r.id=log.relateduserid
            LEFT JOIN mdl_user a ON a.id=log.realuserid
            WHERE objecttable='${module}' AND action='${action}'
                AND log.userid NOT IN (${invalid_users})
                AND (log.relateduserid IS NULL OR log.relateduserid NOT IN (${invalid_users}))
                AND (log.realuserid IS NULL OR log.realuserid NOT IN (${invalid_users}))
            `.replace(/\s+/g, ' '),

        sql_old_2pass: (row) => {
            if (no_object_table(row)){
                return null;
            }
            let lt = linked_table(row.objecttable),
                sql = undefined;
            let f = format_attr_all(row.objecttable, defining_attributes(row.objecttable)),
                lf = format_attr_all(lt, defining_attributes(lt));
            if (!f){
                console.log('WARNING: No defining attributes for objecttable=' + row.objecttable);
                return null;
            }
            if (lt && lf){
                row.__linked = lt;
                sql = `
                    SELECT  ${f},
                            ${lf}
                    FROM mdl_${row.objecttable}
                    LEFT JOIN mdl_course_modules cm ON cm.id=${row.contextinstanceid}
                    LEFT JOIN mdl_${lt} ON mdl_${lt}.id = cm.instance
                    WHERE mdl_${row.objecttable}.id=${row.objectid}
                `.replace(/\s+/g, ' ');
            }else{
                let join = '', special_fields = '';
                let special_links = special_linked_table(row.objecttable);
                if (special_table(row.objecttable) == true && special_links != null) {
                    row.__linked = special_links;
                    if(special_links instanceof Array) {
                        special_links.map((tx, j) => {
                            let tx_fields = format_attr_all(tx, defining_attributes(tx));
                            special_fields = ','+ tx_fields;
                        });
                    } else {
                        let lf = format_attr_all(special_links, defining_attributes(special_links));
                        special_fields = ','+ lf;
                    }
                    join = special_join(row.objecttable);
                }
                sql = `
                    SELECT  ${f}${special_fields}
                    FROM mdl_${row.objecttable}
                    ${join}
                    WHERE mdl_${row.objecttable}.id=${row.objectid}
                `.replace(/\s+/g, ' ');
            }
            return sql;
        },

        sql_match: (row) => {
            let join_subs = [],
                where_subs = [],
                sql = undefined;
            if (row.__linked){
                const default_join_op = 'AND'; // overridden by choice of format_attr_* earlier on
                let fields = [],
                    join_clause = [],
                    join_op = default_join_op,
                    where_clause = [],
                    where_op = default_join_op;

                Object.keys(row).forEach((x) => {
                    let m = x.match(/__(.*)_field_(\d+)/);
                    if (m){
                        let val = `__${m[1]}_value_${m[2]}`;
                        // Given row.__foo_field_0 = 'email', add field "mdl_foo.email AS __foo_value_0"
                        // (Mainly for debugging)
                        fields.push(`mdl_${m[1]}.${row[x]} AS ${val}`);

                        let parts = select_and_split_attr(m[1], row[x]),
                            clause = undefined,
                            have_sub = false;
                        if (parts.length === 1){
                            // Given defining_attributes('foo') => ["email"],
                            // you will have foo.__foo_field_0 = 'email' and row.__foo_value_0 = 'a@b.c',
                            // so add join/where clause "mdl_foo.email = 'a@b.c'"
                            clause = `mdl_${m[1]}.${row[x]} = ?`;
                            have_sub = true;
                        }else if (parts.length === 2){
                            // Given defining_attributes('foo') => ["course:c.id"],
                            // you're linking against a reference in the new table rather than a static value,
                            // so add join/where clause "mdl_foo.course = c.id"
                            clause = `mdl_${m[1]}.${row[x]} = ${parts[1]}`;
                        }else{
                            throw new Error(m[1] + '.' + row[x] + ' is and is not a defining attribute.');
                        }
                        if (m[1] === row.objecttable){
                            where_clause.push(clause);
                            if (have_sub){
                                where_subs.push(row[val]);
                            }
                        }else{
                            join_clause.push(clause);
                            if (have_sub){
                                join_subs.push(row[val]);
                            }
                        }
                        return;
                    }
                    m = x.match(/__(.*)_operator/);
                    if (m){
                        if (m[1] === row.objecttable){
                            where_op = row[x];
                        }else{
                            join_op = row[x];
                        }
                        return;
                    }
                });

                // TODO: get mdl_course_modules based on course+instance
                // TODO: get mdl_context based on contextinstanceid
                sql = `
                    SELECT  u.username AS pri_username, u.email AS pri_email, u.id as pri_userid,
                            r.username AS rel_username, r.email AS rel_email, r.id as rel_userid,
                            a.username AS real_username, a.email AS real_email, a.id as real_userid,
                            c.id AS course_id,c.shortname as course_shortname,
                            mdl_${row.objecttable}.id AS object_id,
                            ${fields.join(',')}
                    FROM mdl_${row.objecttable}
                    LEFT JOIN mdl_course c ON c.shortname=?
                    JOIN mdl_user u ON (u.email='${row.pri_email}' OR u.username='${row.pri_username}')
                    LEFT JOIN mdl_user r ON (r.email='${row.rel_email}' OR r.username='${row.rel_username}')
                    LEFT JOIN mdl_user a ON (a.email='${row.real_email}' OR a.username='${row.real_username}')
                    LEFT JOIN mdl_${row.__linked} ON
                        (${join_clause.join(` ${join_op} `)})
                    WHERE ${where_clause.join(` ${where_op} `)}
                `;
                join_subs.unshift(row.course_shortname);
            }else{
                sql = `
                    SELECT  u.username AS pri_username, u.email AS pri_email, u.id as pri_userid,
                            r.username AS rel_username, r.email AS rel_email, r.id as rel_userid,
                            a.username AS real_username, a.email AS real_email, a.id as real_userid,
                            c.id AS course_id,c.shortname as course_shortname
                    FROM mdl_course c
                    JOIN mdl_user u ON (u.email='${row.pri_email}' OR u.username='${row.pri_username}')
                    LEFT JOIN mdl_user r ON (r.email='${row.rel_email}' OR r.username='${row.rel_username}')
                    LEFT JOIN mdl_user a ON (a.email='${row.real_email}' OR a.username='${row.real_username}')
                    WHERE c.shortname=?
                `;
                if (special_table(row.objecttable) && row.course_shortname == null) {
                    where_subs.push('MSF E-Campus');
                } else {
                    where_subs.push(row.course_shortname);
                }
            }
            let result = mysql.format(sql.replace(/\s+/g, ' '), join_subs.concat(where_subs));
            return result;
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return  (!lr.userid || (lr.pri_username === nm.pri_username || lr.pri_email === nm.pri_email)) &&
                        (!lr.relateduserid || (lr.rel_username === nm.rel_username || lr.rel_email === nm.rel_email)) &&
                        (!lr.realuserid || (lr.real_username === nm.real_username || lr.real_email === nm.real_email));
            });
        },

        fn: function(old_row, match_row, next){
            let output =`
                    INSERT INTO mdl_logstore_standard_log
                        (eventname,component,action,target,objecttable,objectid,crud,
                        edulevel,contextid,contextlevel,contextinstanceid,userid,courseid,
                        relateduserid,anonymous,other,timecreated,origin,ip,realuserid)
                    VALUES (
                        '${old_row.eventname}',
                        '${old_row.component}',
                        '${old_row.action}',
                        '${old_row.target}',
                        '${old_row.objecttable}',
                        ${match_row.object_id || old_row.objectid},
                        '${old_row.crud}',
                        ${old_row.edulevel},
                        ${old_row.contextid},
                        ${old_row.contextlevel},
                        ${old_row.contextinstanceid},
                        ${match_row.pri_userid},
                        ${match_row.course_id},
                        ${match_row.rel_userid},
                        ${old_row.anonymous},
                        ?,
                        ${old_row.timecreated},
                        '${old_row.origin}',
                        '${old_row.ip}',
                        ${match_row.real_userid}
                    )`.replace(/\s+/g, ' ');
            output = mysql.format(output, [old_row.other]);
            next && next(null, output);
        }
    }
}

