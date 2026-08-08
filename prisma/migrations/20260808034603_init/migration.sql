-- CreateTable
CREATE TABLE "LabAccount" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 1000,
    "apiKey" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabComment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabCapture" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flagKey" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabCapture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LabAccount_userId_key" ON "LabAccount"("userId");

-- CreateIndex
CREATE INDEX "LabCapture_userId_idx" ON "LabCapture"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LabCapture_userId_flagKey_key" ON "LabCapture"("userId", "flagKey");

-- AddForeignKey
ALTER TABLE "LabAccount" ADD CONSTRAINT "LabAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabComment" ADD CONSTRAINT "LabComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCapture" ADD CONSTRAINT "LabCapture_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
