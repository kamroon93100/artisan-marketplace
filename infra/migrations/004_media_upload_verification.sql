alter table media_attachments
  add column if not exists verified_at timestamptz,
  add column if not exists verified_content_length bigint,
  add column if not exists verified_content_type text,
  add column if not exists verified_etag text,
  add column if not exists failure_code text,
  add column if not exists failure_message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'media_attachments_failure_code_check'
  ) then
    alter table media_attachments
      add constraint media_attachments_failure_code_check
      check (
        failure_code is null
        or failure_code in (
          'OBJECT_NOT_FOUND',
          'OBJECT_SIZE_MISMATCH',
          'OBJECT_CONTENT_TYPE_MISMATCH'
        )
      );
  end if;
end
$$;

create index if not exists media_attachments_failed_idx
  on media_attachments(state, updated_at)
  where state in ('FAILED', 'ACTION_REQUIRED');

comment on column media_attachments.verified_at is
  'Server time at which object-storage metadata last reconciled with this record.';

comment on column media_attachments.verified_content_length is
  'Object length observed by the server during verification; null until verified.';

comment on column media_attachments.verified_content_type is
  'Object content type observed by the server during verification; null until verified.';

comment on column media_attachments.verified_etag is
  'Object entity tag observed by the server during verification; null until verified.';

comment on column media_attachments.failure_code is
  'Machine-readable reason the record does not currently match stored object metadata.';

comment on column media_attachments.failure_message is
  'Human-readable reason accompanying failure_code; never contains credentials.';
