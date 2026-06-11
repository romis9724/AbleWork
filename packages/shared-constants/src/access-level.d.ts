export declare const AccessLevel: {
    readonly SUPER_ADMIN: "SUPER_ADMIN";
    readonly GENERAL_ADMIN: "GENERAL_ADMIN";
    readonly ORG_ADMIN: "ORG_ADMIN";
    readonly EMPLOYEE: "EMPLOYEE";
};
export type AccessLevel = (typeof AccessLevel)[keyof typeof AccessLevel];
export declare const ACCESS_LEVEL_HIERARCHY: Record<AccessLevel, number>;
//# sourceMappingURL=access-level.d.ts.map