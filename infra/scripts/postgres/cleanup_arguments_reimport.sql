-- Cleanup script for argument reimport.
-- Deletes all arguments, comments, review data, and related likes.
-- Resets counts on ballots.
--
-- Run against the appview database BEFORE reimporting arguments.

BEGIN;

-- 1. Delete review data (references argument URIs)
DELETE FROM app_peerreview_responses;
DELETE FROM app_peerreview_invitations;

-- 2. Delete likes that target arguments or comments
DELETE FROM app_likes
 WHERE subject_uri IN (SELECT uri FROM app_arguments)
    OR subject_uri IN (SELECT uri FROM app_comments);

-- 3. Delete comments (reference argument_uri)
DELETE FROM app_comments;

-- 4. Delete arguments
DELETE FROM app_arguments;

-- 5. Reset counts on ballots
UPDATE app_ballots SET
  argument_count = 0,
  comment_count  = 0;

COMMIT;
