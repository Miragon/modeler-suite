workspace {
    model {
        user = person "User"
        shop = softwareSystem "Shop"
        user --https-> shop "Uses"
    }
}
