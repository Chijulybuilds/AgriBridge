-include .env

.PHONY: dependency test coverage gas deploy-registry deploy-token deploy-price-oracle deploy-protocol verify


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


deploy-protocol:
	forge script script/DeployProtocol.s.sol --fork-url ${SEPOLIA_URL} --private-key ${PRIVATE_KEY} --broadcast

verify:
	forge script script/DeployProtocol.s.sol:DeployProtocol \
  --rpc-url ${SEPOLIA_URL} \
  --broadcast \
  --verify \
  --etherscan-api-key ${ETHERSCAN_API_KEY} \
  --private-key ${PRIVATE_KEY}

mintnft:
	forge script script/Interactions.s.sol:MintNFT \
  --rpc-url ${SEPOLIA_URL} \
  --private-key ${PRIVATE_KEY} \
  --broadcast




