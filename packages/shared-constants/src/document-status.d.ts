export declare const DocumentStatus: {
    readonly DRAFT: "DRAFT";
    readonly PENDING: "PENDING";
    readonly APPROVED: "APPROVED";
    readonly REJECTED: "REJECTED";
    readonly RECALLED: "RECALLED";
    readonly CANCELLED: "CANCELLED";
};
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];
export declare const ApprovalStepStatus: {
    readonly PENDING: "PENDING";
    readonly APPROVED: "APPROVED";
    readonly PRE_APPROVED: "PRE_APPROVED";
    readonly PROXY_APPROVED: "PROXY_APPROVED";
    readonly RETURNED: "RETURNED";
    readonly CANCELLED: "CANCELLED";
    readonly SKIPPED: "SKIPPED";
};
export type ApprovalStepStatus = (typeof ApprovalStepStatus)[keyof typeof ApprovalStepStatus];
export declare const ApprovalStepRole: {
    readonly APPROVER: "approver";
    readonly COLLABORATOR: "collaborator";
    readonly VIEWER: "viewer";
    readonly CC: "cc";
    readonly RECEIVER: "receiver";
    readonly DEPT_COLLABORATOR: "dept_collaborator";
    readonly DEPT_RECEIVER: "dept_receiver";
};
export type ApprovalStepRole = (typeof ApprovalStepRole)[keyof typeof ApprovalStepRole];
//# sourceMappingURL=document-status.d.ts.map