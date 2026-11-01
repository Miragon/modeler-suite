workspace {
    model {
        user = person "User"
        shop = softwareSystem "Shop"
        user -> shop "Uses" "HTTPS"
    }
    views {
        dynamic * "Steps" {
            user -> shop "Orders" "gRPC"
        }
    }
}
