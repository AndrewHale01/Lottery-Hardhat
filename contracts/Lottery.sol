// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Lottery {
    uint256 public constant ENTRY_FEE = 0.01 ether;

    address public immutable manager;
    address[] private players;
    address public lastWinner;
    string public lastWinnerNickname;
    uint256 public currentRound = 1;
    bool private drawing;
    mapping(address => bool) public hasEntered;
    mapping(address => string) public nicknames;

    event PlayerJoined(address indexed player, uint256 indexed round);
    event WinnerSelected(address indexed winner, uint256 prize, uint256 indexed round);

    constructor() {
        manager = msg.sender;
    }

    function enter(string calldata nickname) external payable {
        require(!drawing, "A winner is being selected");
        require(msg.value == ENTRY_FEE, "Entry fee must be exactly 0.01 ETH");
        require(!hasEntered[msg.sender], "Already entered this round");
        require(bytes(nickname).length > 0, "Nickname cannot be empty");
        require(bytes(nickname).length <= 32, "Nickname is too long");

        hasEntered[msg.sender] = true;
        nicknames[msg.sender] = nickname;
        players.push(msg.sender);
        emit PlayerJoined(msg.sender, currentRound);
    }

    function getPlayers() external view returns (address[] memory) {
        return players;
    }

    function pickWinner() external {
        require(msg.sender == manager, "Only the manager can pick a winner");
        require(!drawing, "A winner is being selected");
        require(players.length > 0, "No players in the lottery");

        drawing = true;
        uint256 winningIndex = uint256(
            keccak256(
                abi.encodePacked(
                    block.prevrandao,
                    block.timestamp,
                    address(this),
                    currentRound
                )
            )
        ) % players.length;
        address payable winner = payable(players[winningIndex]);
        uint256 prize = address(this).balance;
        uint256 round = currentRound;

        for (uint256 i = 0; i < players.length; i++) {
            hasEntered[players[i]] = false;
        }

        delete players;
        lastWinner = winner;
        lastWinnerNickname = nicknames[winner];
        currentRound++;

        (bool success, ) = winner.call{value: prize}("");
        require(success, "Prize transfer failed");

        drawing = false;
        emit WinnerSelected(winner, prize, round);
    }
}
