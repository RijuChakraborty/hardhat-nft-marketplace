const { assert, expect }= require("chai")
const {network, deployments, ethers, getNamedAccounts}= require("hardhat")
const {developmentChains}= require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Nft Marketplace Unit Tests", function(){
        let nftMarketplace, basicNft, deployer, user
        const PRICE= ethers.utils.parseEther("0.1")
        const TOKEN_ID=0
        
        beforeEach( async function (){
            deployer= (await getNamedAccounts()).deployer
            // user= (await getNamedAccounts()).user
            const accounts= await ethers.getSigners()
            user= accounts[1]
            await deployments.fixture(["all"])
            nftMarketplace= await ethers.getContract("NftMarketplace")
            basicNft= await ethers.getContract("BasicNft")
            await basicNft.mintNft()
            await basicNft.approve(nftMarketplace.address, TOKEN_ID)
        })

        // it("lists and can be bought", async function(){
        //     await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
        //     const userConnectedNftMarketplace= nftMarketplace.connect(user)
        //     await userConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
        //         value: PRICE,
        //     })
        //     const newOwner= await basicNft.ownerOf(TOKEN_ID)
        //     const deployerProceeds= await nftMarketplace.getProceeds(deployer)
        //     assert(newOwner.toString()== user.address)
        //     assert(deployerProceeds.toString()== PRICE.toString())
        // })

        describe ("listItem", function(){
            it("emits an event after listening an item", async function(){
                expect (await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)).to.emit(
                    "ItemListed"
                )
            })
            it("exclusively items that haven't been listed", async function(){
                await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                await expect (nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)).to.be.revertedWith(
                    "NftMarketplace_AlreadyListed"
                )
            })
            it("exclusively allows owners to list", async function(){
                market= nftMarketplace.connect(user)
                await basicNft.approve(user.address, TOKEN_ID)
                await expect (market.listItem(basicNft.address, TOKEN_ID, PRICE)).to.be.revertedWith(
                    "NftMarketplace_NotOwner"
                )
            })
            it("needs approvals to list item", async function(){
                await basicNft.approve(ethers.constants.AddressZero, TOKEN_ID)
                await expect (nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)).to.be.revertedWith(
                    "NftMarketplace_NotApprovedForMarketplace"
                )
            })
            it("Updates listing with seller and price", async function(){
                await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                const listing= await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                assert.equal(listing.price.toString(), PRICE.toString())
                assert.equal(listing.seller.toString(), deployer) 
            })
        })

        describe ("cancelListing", function (){
            it("reverts if there is no listing", async function(){
                await expect (nftMarketplace.cancelListing(basicNft.address,TOKEN_ID)).to.be.revertedWith(
                    "NftMarketplace_NotListed"
                )
            })
            it("reverts if anyone other than owner tries to call", async function(){
                await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                market= nftMarketplace.connect(user)
                await basicNft.approve(user.address, TOKEN_ID)
                await expect (market.cancelListing(basicNft.address,TOKEN_ID)).to.be.revertedWith(
                    "NftMarketplace_NotOwner"
                )
            })
            it("emits event and removes listing", async function(){
                await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                expect(await nftMarketplace.cancelListing(basicNft.address,TOKEN_ID)).to.emit(
                    "ItemCanceled"
                )
                const listing= await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                assert.equal(listing.price.toString(), "0")
            })
        })

        describe("buyItem", function(){
            it("reverts if the item isn't listed", async function(){
                await expect (nftMarketplace.buyItem(basicNft.address,TOKEN_ID)).to.be.revertedWith(
                    "NftMarketplace_NotListed"
                )
            })
            it("reverts if the price isn't met", async function(){
                await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                market= nftMarketplace.connect(user)
                await expect (market.buyItem(basicNft.address, TOKEN_ID, {value: 0})).to.be.revertedWith(
                    "NftMarketplace_PriceNotMet"
                )
            })
            it("transfers the nft to the buyer and updates internal proceeds record", async function(){
                await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                market= nftMarketplace.connect(user)
                expect(await market.buyItem(basicNft.address, TOKEN_ID, {value: PRICE})).to.emit(
                    "ItemBought"
                )
                const newOwner= await basicNft.ownerOf(TOKEN_ID)
                const deployerProceeds= await nftMarketplace.getProceeds(deployer)
                assert(newOwner.toString()== user.address)
                assert(deployerProceeds.toString()== PRICE.toString())
            })
        })

        describe("updateListing", function(){
            it("must be owner and listed", async function(){
                await expect(nftMarketplace.updateListing(basicNft.address, TOKEN_ID, PRICE)).to.be.revertedWith(
                    "NftMarketplace_NotListed"
                )
                await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                market= nftMarketplace.connect(user)
                await expect(market.updateListing(basicNft.address, TOKEN_ID, PRICE)).to.be.revertedWith(
                    "NftMarketplace_NotOwner"
                )
            })
            it("updates the price of the item", async function(){
                await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                const newPrice= ethers.utils.parseEther("0.2")
                await nftMarketplace.updateListing(basicNft.address, TOKEN_ID, newPrice)
                const listing= await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                assert.equal(listing.price.toString(), newPrice)
            })
        })

        describe ("withdrawProceeds", function(){
            it("doesn't allow 0 proceed withdrawls", async function(){
                await expect(nftMarketplace.withdrawProceeds()).to.be.revertedWith(
                    "NftMarketplace_NoProceeds"
                )
            })
            it("withdraws proceeds", async function(){
                await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                market= nftMarketplace.connect(user)
                await market.buyItem(basicNft.address, TOKEN_ID, {value: PRICE})

                // const proceedsBefore= await nftMarketplace.getProceeds(deployer)
                // const deployerBalanceBefore= await deployer.address.getBalance()
                // const tx= await nftMarketplace.withdrawProceeds()
                await nftMarketplace.withdrawProceeds() //inverse comment
                // const txReceipt= await tx.wait(1)
                // const { gasUsed, effectiveGasPrice }= txReceipt
                // const gasCost= gasUsed.mul(effectiveGasPrice)
                // const deployerBalanceAfter= await deployer.address.getBalance()
                proceedsAfter= await nftMarketplace.getProceeds(deployer)
                
                // assert.equal(deployerBalanceAfter.add(gasCost).toString(), proceedsBefore.add(deployerBalanceBefore).toString())
                assert.equal(proceedsAfter.toString(), "0")
            })
        })

    })