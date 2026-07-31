-- CreateTable
CREATE TABLE "_AdditionalCategories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AdditionalCategories_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_AdditionalCategories_B_index" ON "_AdditionalCategories"("B");

-- AddForeignKey
ALTER TABLE "_AdditionalCategories" ADD CONSTRAINT "_AdditionalCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdditionalCategories" ADD CONSTRAINT "_AdditionalCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "ServiceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
