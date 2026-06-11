export declare const AttendanceStatus: {
    readonly NORMAL: "normal";
    readonly LATE: "late";
    readonly EARLY_LEAVE: "early_leave";
    readonly ABSENT: "absent";
};
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];
export declare const ClockMethod: {
    readonly GPS: "gps";
    readonly WIFI: "wifi";
    readonly MANUAL: "manual";
    readonly WEB: "web";
};
export type ClockMethod = (typeof ClockMethod)[keyof typeof ClockMethod];
export declare const TimeclockAuthMethod: {
    readonly GPS: "gps";
    readonly WIFI: "wifi";
    readonly GPS_OR_WIFI: "gps_or_wifi";
    readonly GPS_AND_WIFI: "gps_and_wifi";
    readonly NONE: "none";
};
export type TimeclockAuthMethod = (typeof TimeclockAuthMethod)[keyof typeof TimeclockAuthMethod];
//# sourceMappingURL=attendance.d.ts.map