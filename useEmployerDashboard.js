"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useEmployerDashboard = useEmployerDashboard;
var react_1 = require("react");
var dashboardApi_1 = require("../services/dashboardApi");
function useEmployerDashboard(cohortId, roleFamilyId, timeframe) {
    if (timeframe === void 0) { timeframe = '30d'; }
    var _a = (0, react_1.useState)(null), data = _a[0], setData = _a[1];
    var _b = (0, react_1.useState)(true), loading = _b[0], setLoading = _b[1];
    var _c = (0, react_1.useState)(null), error = _c[0], setError = _c[1];
    (0, react_1.useEffect)(function () {
        var isMounted = true;
        setLoading(true);
        setError(null);
        (0, dashboardApi_1.fetchEmployerDashboard)({ cohortId: cohortId, roleFamilyId: roleFamilyId, timeframe: timeframe })
            .then(function (result) {
            if (isMounted) {
                setData(result);
            }
        })
            .catch(function (err) {
            if (isMounted) {
                setError(err instanceof Error ? err.message : String(err));
            }
        })
            .finally(function () {
            if (isMounted) {
                setLoading(false);
            }
        });
        return function () {
            isMounted = false;
        };
    }, [cohortId, roleFamilyId, timeframe]);
    return { data: data, loading: loading, error: error };
}
