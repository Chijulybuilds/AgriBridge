-include .env

.PHONY: dependency build test test-fork coverage gas fmt \
        anvil deploy-all deploy-local verify \
        frontend-dev e2e abis

##@ Contracts

dependency:
	forge install smartcontractkit/chainlink-brownie-contracts && \
	forge install Cyfrin/foundry-devops@0.4.0 && \
	forge install openzeppelin/openzeppelin-contracts@v5.6.1

build:
	forge build --sizes

fmt:
	forge fmt

# Unit, fuzz and integration tests all run against a local EVM. No RPC needed.
test:
	forge test -vvv

# Optional: run the suite against a Sepolia fork.
test-fork:
	forge test -vvv --fork-url ${SEPOLIA_URL}

coverage:
	forge coverage

gas:
	forge test --gas-report

##@ Deployment

anvil:
	anvil

# Deploy the whole protocol locally against a running anvil node.
deploy-local:
	forge script script/DeployAll.s.sol:DeployAll \
	  --rpc-url http://127.0.0.1:8545 \
	  --private-key ${ANVIL_PRIVATE_KEY} \
	  --broadcast

# Deploy the whole protocol on Sepolia. This is the supported path when you
# already have deployed contract addresses and just need to re-deploy.
# Copies addresses from .env file.
deploy-all:
	forge script script/DeployAll.s.sol:DeployAll \
	  --rpc-url ${SEPOLIA_URL} \
	  --private-key ${PRIVATE_KEY} \
	  --broadcast

# Same, plus Etherscan verification.
verify:
	forge script script/DeployAll.s.sol:DeployAll \
	  --rpc-url ${SEPOLIA_URL} \
	  --private-key ${PRIVATE_KEY} \
	  --broadcast \
	  --verify \
	  --etherscan-api-key ${ETHERSCAN_API_KEY}

##@ Application

# Regenerate frontend ABIs from Foundry artifacts.
abis:
	forge build && npm run abis

frontend-dev:
	npm run dev

e2e:
	npm run test:e2e
