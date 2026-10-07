import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";

async function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { ethers } = await network.create();
  const [manager] = await ethers.getSigners();
  const lottery = await ethers.deployContract("Lottery");
  await lottery.waitForDeployment();

  const address = await lottery.getAddress();
  const deployedNetwork = await ethers.provider.getNetwork();
  const artifactPath = path.join(
    projectRoot,
    "artifacts",
    "contracts",
    "Lottery.sol",
    "Lottery.json",
  );
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  const deployment = {
    address,
    chainId: deployedNetwork.chainId.toString(),
    abi: artifact.abi,
  };
  const outputPath = path.join(projectRoot, "frontend", "public", "contract.json");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);

  console.log(`Lottery deployed to ${address}`);
  console.log(`Manager: ${await manager.getAddress()}`);
  console.log(`Frontend contract config written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
