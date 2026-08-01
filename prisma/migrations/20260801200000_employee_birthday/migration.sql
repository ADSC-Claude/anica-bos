-- An employee's date of birth.
--
-- Every government form asks for it — SSS, PhilHealth, Pag-IBIG, BIR — and
-- until now the spa held one for clients but not for its own staff. Nullable,
-- because the roster already exists and nobody should be blocked from saving an
-- employee record over a date they have to go and look up.
ALTER TABLE "Employee" ADD COLUMN "birthday" TIMESTAMP(3);
