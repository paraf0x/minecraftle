-- CreateTable
CREATE TABLE "discord_game" (
    "id" SERIAL NOT NULL,
    "discord_id" TEXT NOT NULL,
    "puzzle_number" INTEGER NOT NULL,
    "puzzle_date" TEXT NOT NULL,
    "guesses" JSONB NOT NULL,
    "tries" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "reported_at" TIMESTAMP(3),

    CONSTRAINT "discord_game_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discord_game_discord_id_puzzle_number_key" ON "discord_game"("discord_id", "puzzle_number");
