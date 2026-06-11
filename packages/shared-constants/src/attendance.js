"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeclockAuthMethod = exports.ClockMethod = exports.AttendanceStatus = void 0;
exports.AttendanceStatus = {
    NORMAL: 'normal',
    LATE: 'late',
    EARLY_LEAVE: 'early_leave',
    ABSENT: 'absent',
};
exports.ClockMethod = {
    GPS: 'gps',
    WIFI: 'wifi',
    MANUAL: 'manual',
    WEB: 'web',
};
exports.TimeclockAuthMethod = {
    GPS: 'gps',
    WIFI: 'wifi',
    GPS_OR_WIFI: 'gps_or_wifi',
    GPS_AND_WIFI: 'gps_and_wifi',
    NONE: 'none',
};
//# sourceMappingURL=attendance.js.map