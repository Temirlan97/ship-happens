-- 'bankrupt' | 'acquired' — client-reported (same trust level as the other
-- claimed_* columns), set at /runs/finish. NULL for any row finished before
-- this column existed, or if the client somehow omits it — rendering treats
-- anything other than exactly 'acquired' as a bankrupt/default ending.
ALTER TABLE runs ADD COLUMN ending_reason TEXT;
