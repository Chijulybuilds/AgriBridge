-include .env

.PHONY: dependency test coverage gas deploy-registry deploy-token deploy-price-oracle deploy-pool deploy-share verify_contract mintnft


dependency:
	forge install smartcontractkit/chainlink-brownie-contracts && forge install Cyfrin/foundry-devops@0.4.0 && forge install openzeppelin/openzeppelin-contracts@v5.6.1

test:
	forge test -vvv --fork-url ${SEPOLIA_URL} 

coverage:
	forge coverage --fork-url ${SEPOLIA_URL} 

gas:
	forge test -vvv --gas-report

deploy-registry:
	forge script script/DeployCommodityRegistry.s.sol --fork-url ${SEPOLIA_URL} --private-key ${PRIVATE_KEY} --broadcast

deploy-token:
	forge script script/DeployCommodityToken.s.sol --fork-url ${SEPOLIA_URL} --private-key ${PRIVATE_KEY} --broadcast

deploy-price-oracle:
	forge script script/DeployCommodityPriceOracle.s.sol --fork-url ${SEPOLIA_URL} --private-key ${PRIVATE_KEY} --broadcast


deploy-pool:
	forge script script/DeployLendingPool.s.sol --fork-url ${SEPOLIA_URL} --private-key ${PRIVATE_KEY} --broadcast


deploy-share:
	forge script script/DeployAgriShareToken.s.sol --fork-url ${SEPOLIA_URL} --private-key ${PRIVATE_KEY} --broadcast

verify_contract:
	forge verify-contract 0x8581831eb74d5ee047f544ba297ee4f7e52d3908 src/MyDynamicNFT.sol:MyDynamicNFT \
  --chain-id 11155111 \
  --etherscan-api-key ${ETHERSCAN_API_KEY} \
  --watch \
  --constructor-args ${CONTRACT_ABI}

mintnft:
	forge script script/Interactions.s.sol:MintNFT \
  --rpc-url ${SEPOLIA_URL} \
  --private-key ${PRIVATE_KEY} \
  --broadcast




