-- AlterTable
ALTER TABLE "Product"
ADD COLUMN     "shopId" INTEGER,
ADD COLUMN     "pricePromo" DOUBLE PRECISION,
ADD COLUMN     "wholesalePrice" DOUBLE PRECISION,
ADD COLUMN     "wholesaleMin" DOUBLE PRECISION,
ADD COLUMN     "measure" DOUBLE PRECISION,
ADD COLUMN     "size" TEXT,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "productCreatedAt" TIMESTAMP(3),
ADD COLUMN     "productUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "stockUpdatedAt" TIMESTAMP(3);
