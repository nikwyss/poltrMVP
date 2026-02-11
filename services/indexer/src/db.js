import "dotenv/config";
import { Pool } from "pg";
import process from "node:process";

export const pool = new Pool({
  connectionString: process.env.INDEXER_POSTGRES_URL,
});

export async function closePool() {
  await pool.end();
}

/**
 * Helper: perform safe DB query with provided client or pool.
 */
export async function dbQuery(clientOrPool, text, params = []) {
  if (!clientOrPool) throw new Error("No DB client/pool provided");
  return clientOrPool.query(text, params);
}

/**
 * Upsert a ballot record into app_ballots.
 * Uses the given client (transactional) or pool.
 */
export async function upsertBallotDb(clientOrPool, params) {
  const { uri, cid, did, rkey, record } = params;

  const title = record.title ?? null;
  const description = record.description ?? null;
  const voteDate = record.voteDate ? new Date(record.voteDate) : null;
  const createdAt = record.createdAt ? new Date(record.createdAt) : new Date();

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_ballots
      (uri, cid, did, rkey, title, description, vote_date, created_at, deleted)
    VALUES
      ($1,  $2,  $3,  $4,  $5,    $6,          $7,        $8,        false)
    ON CONFLICT (uri) DO UPDATE SET
      cid         = EXCLUDED.cid,
      title       = EXCLUDED.title,
      description = EXCLUDED.description,
      vote_date   = EXCLUDED.vote_date,
      created_at  = EXCLUDED.created_at,
      deleted     = false,
      indexed_at  = now()
    `,
    [uri, cid, did, rkey, title, description, voteDate, createdAt],
  );
}

export async function markDeleted(uri) {
  await pool.query(
    `UPDATE app_ballots
     SET deleted = true, indexed_at = now()
     WHERE uri = $1`,
    [uri],
  );
}

/**
 * Upsert a like record into app_likes.
 */
export async function upsertLikeDb(clientOrPool, params) {
  const { uri, cid, did, rkey, record } = params;

  const subjectUri = record?.subject?.uri ?? null;
  const subjectCid = record?.subject?.cid ?? null;
  const createdAt = record?.createdAt ? new Date(record.createdAt) : new Date();

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_likes
      (uri, cid, did, rkey, subject_uri, subject_cid, created_at, deleted)
    VALUES
      ($1,  $2,  $3,  $4,  $5,          $6,          $7,         false)
    ON CONFLICT (uri) DO UPDATE SET
      cid         = EXCLUDED.cid,
      subject_uri = EXCLUDED.subject_uri,
      subject_cid = EXCLUDED.subject_cid,
      created_at  = EXCLUDED.created_at,
      deleted     = false,
      indexed_at  = now()
    `,
    [uri, cid, did, rkey, subjectUri, subjectCid, createdAt],
  );

  if (subjectUri) {
    await refreshLikeCount(clientOrPool, subjectUri);
  }
}

/**
 * Soft-delete a like and refresh the parent ballot's like_count.
 */
export async function markLikeDeleted(uri) {
  const res = await pool.query(
    `UPDATE app_likes
     SET deleted = true, indexed_at = now()
     WHERE uri = $1
     RETURNING subject_uri`,
    [uri],
  );

  const subjectUri = res.rows?.[0]?.subject_uri;
  if (subjectUri) {
    await refreshLikeCount(pool, subjectUri);
  }
}

/**
 * Recount non-deleted likes and update app_ballots.like_count.
 */
/**
 * Upsert a pseudonym profile into app_profiles.
 */
export async function upsertProfileDb(clientOrPool, params) {
  const { did, record } = params;

  const displayName = record.displayName ?? null;
  const mountainName = record.mountainName ?? null;
  const mountainFullname = record.mountainFullname ?? null;
  const canton = record.canton ?? null;
  const height = record.height ?? null;
  const color = record.color ?? null;
  const createdAt = record.createdAt ? new Date(record.createdAt) : null;

  await dbQuery(
    clientOrPool,
    `
    INSERT INTO app_profiles
      (did, display_name, mountain_name, mountain_fullname, canton, height, color, created_at)
    VALUES
      ($1,  $2,           $3,            $4,                $5,     $6,     $7,    $8)
    ON CONFLICT (did) DO UPDATE SET
      display_name      = EXCLUDED.display_name,
      mountain_name     = EXCLUDED.mountain_name,
      mountain_fullname = EXCLUDED.mountain_fullname,
      canton            = EXCLUDED.canton,
      height            = EXCLUDED.height,
      color             = EXCLUDED.color,
      created_at        = EXCLUDED.created_at,
      indexed_at        = now()
    `,
    [did, displayName, mountainName, mountainFullname, canton, height, color, createdAt],
  );
}

/**
 * Delete a profile from app_profiles.
 */
export async function deleteProfile(did) {
  await pool.query(
    `DELETE FROM app_profiles WHERE did = $1`,
    [did],
  );
}

export async function refreshLikeCount(clientOrPool, subjectUri) {
  await dbQuery(
    clientOrPool,
    `
    UPDATE app_ballots
    SET like_count = (
      SELECT count(*) FROM app_likes
      WHERE subject_uri = $1 AND NOT deleted
    )
    WHERE uri = $1
    `,
    [subjectUri],
  );
}
