import { expect } from "chai";
import { network } from "hardhat";

describe("Lottery", function () {
  let lottery;
  let manager;
  let firstPlayer;
  let secondPlayer;
  let ethers;
  const entryFee = 10n ** 16n;

  beforeEach(async function () {
    ({ ethers } = await network.create());
    [manager, firstPlayer, secondPlayer] = await ethers.getSigners();
    lottery = await ethers.deployContract("Lottery");
  });

  it("accepts a nickname and one correctly priced entry per address per round", async function () {
    await lottery.connect(firstPlayer).enter("LuckyPlayer", { value: entryFee });

    expect(await lottery.getPlayers()).to.deep.equal([firstPlayer.address]);
    expect(await ethers.provider.getBalance(await lottery.getAddress())).to.equal(entryFee);
    expect(await lottery.hasEntered(firstPlayer.address)).to.equal(true);
    expect(await lottery.nicknames(firstPlayer.address)).to.equal("LuckyPlayer");

    await expect(
      lottery.connect(firstPlayer).enter("LuckyPlayer", { value: entryFee }),
    ).to.be.revertedWith("Already entered this round");
    await expect(
      lottery.connect(secondPlayer).enter("Player", { value: 1n }),
    ).to.be.revertedWith("Entry fee must be exactly 0.01 ETH");
    await expect(
      lottery.connect(secondPlayer).enter("", { value: entryFee }),
    ).to.be.revertedWith("Nickname cannot be empty");
    await expect(
      lottery.connect(secondPlayer).enter("a".repeat(33), { value: entryFee }),
    ).to.be.revertedWith("Nickname is too long");
  });

  it("only lets the manager draw a winner when players have joined", async function () {
    await expect(lottery.pickWinner()).to.be.revertedWith("No players in the lottery");

    await lottery.connect(firstPlayer).enter("FirstPlayer", { value: entryFee });
    await expect(
      lottery.connect(firstPlayer).pickWinner(),
    ).to.be.revertedWith("Only the manager can pick a winner");
  });

  it("pays the prize and starts a clean new round", async function () {
    await lottery.connect(firstPlayer).enter("FirstPlayer", { value: entryFee });
    await lottery.connect(secondPlayer).enter("SecondPlayer", { value: entryFee });

    const firstPlayerBalance = await ethers.provider.getBalance(firstPlayer.address);
    const secondPlayerBalance = await ethers.provider.getBalance(secondPlayer.address);
    await lottery.pickWinner();
    const winner = await lottery.lastWinner();
    const expectedNickname =
      winner === firstPlayer.address ? "FirstPlayer" : "SecondPlayer";

    expect([firstPlayer.address, secondPlayer.address]).to.include(winner);
    expect(await lottery.lastWinnerNickname()).to.equal(expectedNickname);
    expect(await ethers.provider.getBalance(winner)).to.equal(
      (winner === firstPlayer.address ? firstPlayerBalance : secondPlayerBalance)
        + entryFee * 2n,
    );
    expect(await ethers.provider.getBalance(await lottery.getAddress())).to.equal(0n);
    expect(await lottery.getPlayers()).to.deep.equal([]);
    expect(await lottery.hasEntered(firstPlayer.address)).to.equal(false);
    expect(await lottery.hasEntered(secondPlayer.address)).to.equal(false);
    expect(await lottery.currentRound()).to.equal(2n);
  });
});
