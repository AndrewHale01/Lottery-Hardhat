import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";

const zeroAddress = "0x0000000000000000000000000000000000000000";

function errorMessage(error) {
  return error?.shortMessage || error?.reason || error?.message || "Сталася помилка.";
}

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function App() {
  const [deployment, setDeployment] = useState(null);
  const deploymentRef = useRef(null);
  const [account, setAccount] = useState("");
  const [lottery, setLottery] = useState(null);
  const [players, setPlayers] = useState([]);
  const [playerNicknames, setPlayerNicknames] = useState([]);
  const [balance, setBalance] = useState("0");
  const [winner, setWinner] = useState("");
  const [winnerNickname, setWinnerNickname] = useState("");
  const [round, setRound] = useState("1");
  const [manager, setManager] = useState("");
  const [nickname, setNickname] = useState("");
  const [hasEntered, setHasEntered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async (activeDeployment = deploymentRef.current) => {
    if (!window.ethereum) return;

    const provider = new BrowserProvider(window.ethereum);
    const [network, accounts] = await Promise.all([
      provider.getNetwork(),
      window.ethereum.request({ method: "eth_accounts" }),
    ]);
    const address = accounts[0] || "";
    setAccount(address);

    if (
      !activeDeployment?.address ||
      network.chainId.toString() !== activeDeployment.chainId
    ) {
      setLottery(null);
      return;
    }

    const contract = new Contract(
      activeDeployment.address,
      activeDeployment.abi,
      provider,
    );
    const [owner, entrants, lastWinner, currentRound, amount] = await Promise.all([
      contract.manager(),
      contract.getPlayers(),
      contract.lastWinner(),
      contract.lastWinnerNickname(),
      contract.currentRound(),
      provider.getBalance(activeDeployment.address),
    ]);
    const entrantNicknames = await Promise.all(
      entrants.map((entrant) => contract.nicknames(entrant)),
    );

    setLottery(contract);
    setManager(owner);
    setPlayers(entrants);
    setPlayerNicknames(entrantNicknames);
    setWinner(lastWinner);
    setWinnerNickname(lastWinnerNickname);
    setRound(currentRound.toString());
    setBalance(formatEther(amount));
    setHasEntered(address ? await contract.hasEntered(address) : false);
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch("/contract.json")
      .then((response) => {
        if (!response.ok) throw new Error("Не вдалося завантажити адресу контракту.");
        return response.json();
      })
      .then((config) => {
        if (mounted) {
          deploymentRef.current = config;
          setDeployment(config);
          if (window.ethereum) {
            refresh(config).catch((reason) => setError(errorMessage(reason)));
          }
        }
      })
      .catch((reason) => setError(errorMessage(reason)));

    if (!window.ethereum) {
      setError("Для роботи застосунку встановіть MetaMask.");
    } else {
      const handleWalletChange = () => {
        refresh().catch((reason) => setError(errorMessage(reason)));
      };
      window.ethereum.on("accountsChanged", handleWalletChange);
      window.ethereum.on("chainChanged", handleWalletChange);
      return () => {
        mounted = false;
        window.ethereum.removeListener("accountsChanged", handleWalletChange);
        window.ethereum.removeListener("chainChanged", handleWalletChange);
      };
    }

    return () => {
      mounted = false;
    };
  }, [refresh]);

  async function connectWallet() {
    if (!window.ethereum) {
      setError("Для роботи застосунку встановіть MetaMask.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      await refresh();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function joinLottery() {
    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      setError("Введіть нікнейм.");
      return;
    }
    if (new TextEncoder().encode(trimmedNickname).length > 32) {
      setError("Нікнейм має містити не більше 32 байтів UTF-8.");
      return;
    }

    await sendTransaction(
      (contract) => contract.enter(trimmedNickname, { value: parseEther("0.01") }),
      "Ви приєдналися до лотереї.",
    );
  }

  async function pickWinner() {
    await sendTransaction(
      (contract) => contract.pickWinner(),
      "Переможця визначено.",
    );
  }

  async function sendTransaction(action, successMessage) {
    if (!lottery || !window.ethereum) return;

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const transaction = await action(lottery.connect(signer));
      setMessage("Очікуємо підтвердження транзакції…");
      await transaction.wait();
      setMessage(successMessage);
      await refresh();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const isManager =
    account && manager && account.toLowerCase() === manager.toLowerCase();
  const correctNetwork =
    deployment?.address && lottery;
  const displayedWinner =
    winner && winner !== zeroAddress ? shortAddress(winner) : "ще не визначений";

  return (
    <main className="page">
      <header className="header">
        <h1>Лотерея</h1>
        <button onClick={connectWallet} disabled={busy} type="button">
          {account ? shortAddress(account) : "Підключити гаманець"}
        </button>
      </header>

      {!deployment?.address && (
        <p className="message">
          Спочатку розгорніть контракт командою <code>npm run deploy:local</code>.
        </p>
      )}
      {deployment?.address && !correctNetwork && (
        <p className="message">
          Підключіть MetaMask до локальної мережі Hardhat (Chain ID{" "}
          {deployment.chainId}).
        </p>
      )}
      {error && <p className="message error" role="alert">{error}</p>}
      {message && <p className="message" role="status">{message}</p>}

      <section className="details" aria-label="Інформація про лотерею">
        <p><strong>Баланс:</strong> {balance} ETH</p>
        <p><strong>Вартість участі:</strong> 0.01 ETH</p>
        <p><strong>Учасників:</strong> {players.length}</p>
        <p><strong>Раунд:</strong> {round}</p>
        <p>
          <strong>Останній переможець:</strong>{" "}
          {winnerNickname ? `${winnerNickname} (${displayedWinner})` : displayedWinner}
        </p>
      </section>

      <section className="participants" aria-label="Учасники лотереї">
        <h2>Учасники</h2>
        {players.length === 0 ? (
          <p>Поки що учасників немає.</p>
        ) : (
          <ul>
            {players.map((player, index) => (
              <li key={player}>
                <strong>{playerNicknames[index]}</strong>{" "}
                <span>({shortAddress(player)})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <label className="nickname-field">
        Ваш нікнейм
        <input
          type="text"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          maxLength={32}
          placeholder="Наприклад, LuckyPlayer"
          disabled={!correctNetwork || hasEntered || busy}
        />
      </label>

      <section className="actions" aria-label="Дії лотереї">
        <button
          onClick={joinLottery}
          disabled={!correctNetwork || !account || hasEntered || !nickname.trim() || busy}
          type="button"
        >
          {hasEntered ? "Ви вже приєдналися" : "Приєднатися"}
        </button>
        <button
          onClick={pickWinner}
          disabled={!correctNetwork || !isManager || !players.length || busy}
          type="button"
        >
          Визначити переможця
        </button>
        <button
          onClick={() => refresh().catch((reason) => setError(errorMessage(reason)))}
          disabled={!correctNetwork || busy}
          type="button"
        >
          Оновити баланс лотереї
        </button>
      </section>
    </main>
  );
}
