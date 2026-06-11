"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalStepRole = exports.ApprovalStepStatus = exports.DocumentStatus = void 0;
exports.DocumentStatus = {
    DRAFT: 'DRAFT',
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    RECALLED: 'RECALLED',
    CANCELLED: 'CANCELLED',
};
exports.ApprovalStepStatus = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    PRE_APPROVED: 'PRE_APPROVED',
    PROXY_APPROVED: 'PROXY_APPROVED',
    RETURNED: 'RETURNED',
    CANCELLED: 'CANCELLED',
    SKIPPED: 'SKIPPED',
};
exports.ApprovalStepRole = {
    APPROVER: 'approver',
    COLLABORATOR: 'collaborator',
    VIEWER: 'viewer',
    CC: 'cc',
    RECEIVER: 'receiver',
    DEPT_COLLABORATOR: 'dept_collaborator',
    DEPT_RECEIVER: 'dept_receiver',
};
//# sourceMappingURL=document-status.js.map