
module.exports = function(){
    var courses = [],
        users   = [],
        not_users = require('./invalid_users'),
        clause = '',
        AND = () => { return clause.length ? ' AND' : '' };

    if (courses.length){
        clause += AND() + ' log.course in (' + courses.join(',') + ')';
    }
    if (users.length){
        clause += AND() + ' log.userid in (' + users.join(',') + ')';
    }
    if (not_users.length){
        clause += AND() + ' log.userid not in (' + not_users.join(',') + ')';
    }
    if (clause.length < 1){
        clause = ' 1=1';
    }
    return clause;
}

