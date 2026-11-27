/**
 * The exact effective privileges each API pool role must hold (decision D-035). The startup
 * check (`assertSafeRuntimeRole`) refuses to start when the connected role holds anything more
 * — or anything less — than this. A migration that grants a new privilege must update this list
 * in the same change; the database tests compare it with the migrated schema.
 */
export type PoolRole = 'runtime' | 'operator';

export const EXPECTED_PRIVILEGES: Record<PoolRole, readonly string[]> = {
  runtime: [
    'table:app.tenants:SELECT',
    'table:app.memberships:SELECT',
    'function:app.current_tenant_id:EXECUTE',
    'function:app.resolve_active_tenant:EXECUTE',
    'function:app.session_create:EXECUTE',
    'function:app.session_validate:EXECUTE',
    'function:app.session_revoke:EXECUTE',
  ],
  operator: [
    'function:app.current_tenant_id:EXECUTE',
    'function:app.operator_provision_tenant:EXECUTE',
    'function:app.operator_set_tenant_status:EXECUTE',
    'function:app.operator_get_tenant:EXECUTE',
    'function:app.operator_get_account:EXECUTE',
    'function:app.operator_set_account_status:EXECUTE',
    'function:app.operator_revoke_owner_membership:EXECUTE',
    'function:app.operator_transfer_ownership:EXECUTE',
    'function:app.operator_unlink_account_identity:EXECUTE',
    'function:app.operator_link_account_identity:EXECUTE',
    'function:app.operator_operation_outcome:EXECUTE',
  ],
};
