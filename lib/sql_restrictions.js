
module.exports = function(){
    var courses = [],
        users   = [],
        not_users = [
            1666, // nagioscheckeveris
            1982, // everis
            // users no longer in the system:
            219,248,255,400,552,580,711,1000,1033,1052,1119,1152,1195,1307,2014,
            // users with no email address (or otherwise ambiguous)
            3,4,5,6,7,8,9,10,25,54,65,90,183,203,1530,1532,1533,1534,1535,1536
        ],
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

