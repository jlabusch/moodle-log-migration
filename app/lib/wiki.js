var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "add": {
        //The data structure has 'wiki_id' in the 'info' column.
        sql_old:    'SELECT log.*, w.id AS wiki_id, ' +
                '       u.username, u.email, ' +
                '       w.name AS wiki_name, ' +
                '       c.shortname AS course_shortname ' +
                'FROM mdl_log log ' +
                'JOIN mdl_user u on u.id = log.userid ' +
                'JOIN mdl_course c ON c.id = log.course ' +
                'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                'JOIN mdl_wiki w on w.id = log.info AND w.id = cm.instance ' +
                "WHERE log.module = 'wiki' AND log.action = 'add' AND " + restrict_clause,
        
        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       w.id AS wiki_id, w.name AS wiki_name, ' + 
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid ' +
                'FROM mdl_course c ' +
                'LEFT JOIN mdl_wiki w ON w.course = c.id ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ? ) ' +
                'JOIN mdl_course_modules cm ON cm.course = c.id AND cm.module = ' +
                    "   (SELECT id from mdl_modules where name = 'wiki') " +
                'WHERE c.shortname = ? AND w.name = ?',
                [
                    row["username"],
                    row["email"],
                    row["course_shortname"],
                    row["wiki_name"]
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
                                "'" + match_row.wiki_id + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "update":{
        alias: () => { make_alias(library, 'update', 'add') }
    },
    "add page":{
        //The data structure has 'mdl_wiki_pages_id' in the 'info' column and 'url' looks like this 'view.php?pageid=1'.
        //Will use 'mdl_wiki.name' and 'mdl_wiki_page.title' to match results to the new db. The 'mdl_wiki' and 'mdl_wiki_pages' are joined together through 'mdl_wiki_subwikis'.
        sql_old:    'SELECT log.*, ' +
                '       u.username, u.email, ' +
                '       w.name AS wiki_name, ' +
                '       wp.id AS wiki_page_id, wp.title AS wiki_page_title, ' +
                '       sw.id AS subwiki_id, ' +
                '       c.shortname AS course_shortname ' +
                'FROM mdl_log log ' +
                'JOIN mdl_user u on u.id = log.userid ' +
                'JOIN mdl_course c ON c.id = log.course ' +
                'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                'JOIN mdl_wiki w ON w.id = cm.instance ' +
                'JOIN mdl_wiki_subwikis sw ON sw.wikiid = w.id ' +
                'JOIN mdl_wiki_pages wp ON wp.id = log.info AND wp.subwikiid = sw.id  ' +
                "WHERE log.module = 'wiki' AND log.action = 'add page' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       w.id AS wiki_id, w.name AS wiki_name, ' + 
                '       sw.id AS subwiki_id, ' +
                '       wp.id AS wiki_page_id, wp.title AS wiki_page_title, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_wiki w ON w.course = c.id ' +
                'JOIN mdl_wiki_subwikis sw ON sw.wikiid = w.id ' +
                'JOIN mdl_wiki_pages wp on wp.subwikiid = sw.id  ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ? ) ' +
                'JOIN mdl_course_modules cm ON cm.course = c.id AND cm.module = ' +
                    "   (SELECT id from mdl_modules where name = 'wiki') " +
                'WHERE c.shortname = ? AND w.name = ? AND wp.title = ?',
                [
                    row["username"],
                    row["email"],
                    row["course_shortname"],
                    row["wiki_name"],
                    row["wiki_page_title"]
                ]
            )
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url.replace(/\?pageid=\d+/, '?pageid=' + match_row.wiki_page_id);

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
                                "'" + match_row.wiki_page_id + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "edit":{
        alias: () => { make_alias(library, 'edit', 'add page') }
    },
    "history":{
        alias: () => { make_alias(library, 'history', 'add page') }
    },
    "map":{
        alias: () => { make_alias(library, 'map', 'add page') }
    },
    "comment":{
        alias: () => { make_alias(library, 'comment', 'add page') }
    },
    "diff":{
        alias: () => { make_alias(library, 'diff', 'add page') }
    },
    "comments":{
        alias: () => { make_alias(library, 'comments', 'add page') }
    },
    "admin":{
        alias: () => { make_alias(library, 'admin', 'add page') }
    },
    "view":{
        //This query is similar to the one from the "add page" action except not all 'info' columns have mdl_wiki_page.id (some have the cmid). So I gave up the "ON wp.id = log.info".
        sql_old:    'SELECT log.*, ' +
                '       u.username, u.email, ' +
                '       w.name AS wiki_name, ' +
                '       wp.id AS wiki_page_id, wp.title AS wiki_page_title, ' +
                '       sw.id AS subwiki_id, ' +
                '       c.shortname AS course_shortname ' +
                'FROM mdl_log log ' +
                'JOIN mdl_user u on u.id = log.userid ' +
                'JOIN mdl_course c ON c.id = log.course ' +
                'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                'JOIN mdl_wiki w ON w.id = cm.instance ' +
                'JOIN mdl_wiki_subwikis sw ON sw.wikiid = w.id ' +// no "ON wp.id = log.info"
                'JOIN mdl_wiki_pages wp ON wp.subwikiid = sw.id  ' +
                "WHERE log.module = 'wiki' AND log.action = 'view' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       w.id AS wiki_id, w.name AS wiki_name, ' + 
                '       sw.id AS subwiki_id, ' +
                '       wp.id AS wiki_page_id, wp.title AS wiki_page_title, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_wiki w ON w.course = c.id ' +
                'JOIN mdl_wiki_subwikis sw ON sw.wikiid = w.id ' +
                'JOIN mdl_wiki_pages wp on wp.subwikiid = sw.id  ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ? ) ' +
                'JOIN mdl_course_modules cm ON cm.course = c.id AND cm.module = ' +
                    "   (SELECT id from mdl_modules where name = 'wiki') " +
                'WHERE c.shortname = ? AND w.name = ? AND wp.title = ?',
                [
                    row["username"],
                    row["email"],
                    row["course_shortname"],
                    row["wiki_name"],
                    row["wiki_page_title"]
                ]
            )
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                    .replace(/\?id=\d+/, '?id=' + match_row.cmid)
                                    .replace(/\?pageid=\d+/, '?pageid=' + match_row.wiki_page_id);

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
                                "'" + match_row.wiki_page_id + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "view all":{
        //No cmid, no info.(same as 'chat' module -> 'view all' action)
        sql_old:    'SELECT log.*, ' +
            '       u.username, u.email, ' +
            '       c.shortname AS course_shortname ' +
            'FROM mdl_log log ' +
            'JOIN mdl_user u on u.id = log.userid ' +
            'JOIN mdl_course c ON c.id = log.course ' +
            "WHERE log.module = 'label' AND log.action = 'view all' AND " + restrict_clause,
    
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
    "info":undefined,
    "links":undefined,
    "overridelocks":undefined
};

module.exports = library;
