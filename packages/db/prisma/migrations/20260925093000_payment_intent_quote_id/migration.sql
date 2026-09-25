-- AlterTable
ALTER TABLE "PaymentIntent" ADD COLUMN     "quoteId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_quoteId_key" ON "PaymentIntent"("quoteId");

